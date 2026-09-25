const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../auth');

// Todas las rutas de reportes son exclusivas de Administrador
router.use(authenticateToken);
router.use(requireAdmin);

// Función auxiliar para obtener la fecha local actual de Buenos Aires (GMT-3)
function getTodayLocalDate() {
  return db.prepare("SELECT DATE('now', '-3 hours') as today").get().today;
}

// GET /api/reports/dashboard?period=day|week|month
router.get('/dashboard', (req, res) => {
  const period = req.query.period || 'day';

  try {
    let dateFilter = "";
    if (period === 'day') {
      // Hoy en hora Buenos Aires (GMT-3)
      dateFilter = "DATE(created_at, '-3 hours') = DATE('now', '-3 hours')";
    } else if (period === 'week') {
      // Últimos 7 días en hora Buenos Aires
      dateFilter = "DATE(created_at, '-3 hours') >= DATE('now', '-3 hours', '-7 days')";
    } else if (period === 'month') {
      // Mes actual en hora Buenos Aires
      dateFilter = "strftime('%Y-%m', created_at, '-3 hours') = strftime('%Y-%m', 'now', '-3 hours')";
    } else {
      dateFilter = "1=1";
    }

    // 1. Resumen global del período
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit
      FROM ventas
      WHERE ${dateFilter}
    `).get();

    // 2. Ventas por método de pago
    const byPaymentMethod = db.prepare(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM ventas
      WHERE ${dateFilter}
      GROUP BY payment_method
    `).all();

    // 3. Top 5 productos más vendidos en el período
    const topProducts = db.prepare(`
      SELECT 
        vd.product_name,
        SUM(vd.quantity) as total_qty,
        SUM(vd.subtotal) as total_sales
      FROM venta_detalles vd
      JOIN ventas v ON vd.sale_id = v.id
      WHERE ${dateFilter.replace(/created_at/g, 'v.created_at')}
      GROUP BY vd.product_name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all();

    // 4. Conteo de stock crítico (menor o igual a 5 unidades)
    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM productos WHERE stock <= 5
    `).get().count;

    res.json({
      period,
      summary,
      byPaymentMethod,
      topProducts,
      lowStockCount
    });
  } catch (error) {
    console.error('Error calculando reportes:', error);
    res.status(500).json({ error: 'Error al generar los reportes.' });
  }
});

// GET /api/reports/caja-actual - Contador de plata del turno actual (reiniciable con Cerrar Caja)
router.get('/caja-actual', (req, res) => {
  try {
    const configRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'ultimo_cierre_caja'").get();
    const lastClosureTime = configRow ? configRow.valor : null;

    let query = `
      SELECT 
        COUNT(*) as sales_count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(SUM(CASE WHEN payment_method = 'Efectivo' THEN total_amount ELSE 0 END), 0) as efectivo,
        COALESCE(SUM(CASE WHEN payment_method = 'Transferencia' THEN total_amount ELSE 0 END), 0) as transferencia,
        COALESCE(SUM(CASE WHEN payment_method = 'QR' THEN total_amount ELSE 0 END), 0) as qr
      FROM ventas
    `;
    const params = [];

    if (lastClosureTime) {
      query += ` WHERE created_at > ?`;
      params.push(lastClosureTime);
    } else {
      query += ` WHERE DATE(created_at, '-3 hours') = DATE('now', '-3 hours')`;
    }

    const currentShift = db.prepare(query).get(...params);

    let ultimoCierreTexto = 'Sin cierres previos registrados (Turno inicial)';
    if (lastClosureTime) {
      const row = db.prepare("SELECT strftime('%d/%m/%Y %H:%M:%S', ?, '-3 hours') as f").get(lastClosureTime);
      if (row && row.f) {
        ultimoCierreTexto = `${row.f} hs`;
      }
    }

    res.json({
      ultimoCierre: lastClosureTime,
      ultimoCierreTexto,
      currentShift
    });
  } catch (error) {
    console.error('Error consultando caja actual:', error);
    res.status(500).json({ error: 'Error al consultar caja actual.' });
  }
});

// POST /api/reports/cerrar-caja - Cerrar caja: reinicia el contador de plata del turno a $0 sin tocar stock ni reportes
router.post('/cerrar-caja', (req, res) => {
  const adminId = req.user.id;
  const { notas } = req.body || {};

  try {
    const configRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'ultimo_cierre_caja'").get();
    const lastClosureTime = configRow ? configRow.valor : null;

    let query = `
      SELECT 
        COUNT(*) as sales_count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(SUM(CASE WHEN payment_method = 'Efectivo' THEN total_amount ELSE 0 END), 0) as efectivo,
        COALESCE(SUM(CASE WHEN payment_method = 'Transferencia' THEN total_amount ELSE 0 END), 0) as transferencia,
        COALESCE(SUM(CASE WHEN payment_method = 'QR' THEN total_amount ELSE 0 END), 0) as qr
      FROM ventas
    `;
    const params = [];

    if (lastClosureTime) {
      query += ` WHERE created_at > ?`;
      params.push(lastClosureTime);
    } else {
      query += ` WHERE DATE(created_at, '-3 hours') = DATE('now', '-3 hours')`;
    }

    const shiftData = db.prepare(query).get(...params);

    const closeTx = db.transaction(() => {
      // 1. Guardar registro en historial de cierres
      db.prepare(`
        INSERT INTO cierres_caja (admin_id, total_amount, total_profit, sales_count, efectivo_amount, transferencia_amount, qr_amount, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        adminId,
        shiftData.total_amount,
        shiftData.total_profit,
        shiftData.sales_count,
        shiftData.efectivo,
        shiftData.transferencia,
        shiftData.qr,
        notas || 'Cierre de caja de turno'
      );

      // 2. Actualizar último cierre a momento actual
      db.prepare(`
        INSERT INTO configuracion (clave, valor)
        VALUES ('ultimo_cierre_caja', datetime('now'))
        ON CONFLICT(clave) DO UPDATE SET valor = datetime('now')
      `).run();
    });

    closeTx();

    res.json({
      message: 'Caja cerrada exitosamente. El contador de dinero del turno ha sido reiniciado a $0.',
      resumenCierre: shiftData
    });
  } catch (error) {
    console.error('Error al realizar cierre de caja:', error);
    res.status(500).json({ error: 'Error al procesar el cierre de caja.' });
  }
});

// GET /api/reports/historial-cierres - Historial de cierres de caja anteriores
router.get('/historial-cierres', (req, res) => {
  try {
    const cierres = db.prepare(`
      SELECT 
        c.id,
        c.total_amount,
        c.total_profit,
        c.sales_count,
        c.efectivo_amount,
        c.transferencia_amount,
        c.qr_amount,
        c.notas,
        strftime('%d/%m/%Y %H:%M:%S', c.created_at, '-3 hours') as fecha_hora,
        u.nombre as admin_nombre,
        u.username as admin_user
      FROM cierres_caja c
      JOIN usuarios u ON c.admin_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 25
    `).all();

    res.json(cierres);
  } catch (error) {
    console.error('Error listando cierres de caja:', error);
    res.status(500).json({ error: 'Error al obtener historial de cierres.' });
  }
});

// GET /api/reports/daily-closure - Reporte detallado de ventas y ganancia hasta el momento (GMT-3)
router.get('/daily-closure', (req, res) => {
  const targetDate = req.query.date && req.query.date.trim() !== '' 
    ? req.query.date.trim() 
    : getTodayLocalDate();

  try {
    const configRows = db.prepare('SELECT clave, valor FROM configuracion').all();
    const config = {};
    configRows.forEach(r => { config[r.clave] = r.valor; });

    // Hora exacta convertida a GMT-3 Buenos Aires
    const sales = db.prepare(`
      SELECT 
        v.id,
        v.user_id,
        v.payment_method,
        v.total_amount,
        v.total_cost,
        v.profit,
        v.created_at,
        strftime('%H:%M:%S', v.created_at, '-3 hours') as hora,
        strftime('%d/%m/%Y', v.created_at, '-3 hours') as fecha,
        u.nombre as cajero_nombre,
        u.username as cajero_user
      FROM ventas v
      JOIN usuarios u ON v.user_id = u.id
      WHERE DATE(v.created_at, '-3 hours') = ?
      ORDER BY v.created_at ASC
    `).all(targetDate);

    const getItemsStmt = db.prepare(`
      SELECT 
        product_name,
        barcode,
        quantity,
        unit_price,
        unit_cost,
        subtotal,
        (subtotal - (unit_cost * quantity)) as item_profit
      FROM venta_detalles
      WHERE sale_id = ?
    `);

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalUnits = 0;
    const paymentTotals = { 'Efectivo': 0, 'Transferencia': 0, 'QR': 0 };

    const detailedSales = sales.map(s => {
      totalRevenue += s.total_amount;
      totalCost += s.total_cost;
      totalProfit += s.profit;
      paymentTotals[s.payment_method] = (paymentTotals[s.payment_method] || 0) + s.total_amount;

      const items = getItemsStmt.all(s.id);
      items.forEach(i => { totalUnits += i.quantity; });

      return {
        ...s,
        items
      };
    });

    const nowBA = db.prepare("SELECT strftime('%H:%M:%S', 'now', '-3 hours') as hora_ba").get().hora_ba;

    res.json({
      store: config,
      date: targetDate,
      generatedAt: `${nowBA} hs (GMT-3)`,
      summary: {
        totalSalesCount: sales.length,
        totalUnitsSold: totalUnits,
        totalRevenue,
        totalCost,
        totalProfit,
        paymentTotals
      },
      sales: detailedSales
    });
  } catch (error) {
    console.error('Error generando reporte diario:', error);
    res.status(500).json({ error: 'Error al generar el reporte diario.' });
  }
});

// GET /api/reports/daily-closure/csv - Descargar reporte en archivo CSV con horas en GMT-3
router.get('/daily-closure/csv', (req, res) => {
  const targetDate = req.query.date && req.query.date.trim() !== '' 
    ? req.query.date.trim() 
    : getTodayLocalDate();

  try {
    const sales = db.prepare(`
      SELECT 
        v.id as ticket,
        strftime('%H:%M:%S', v.created_at, '-3 hours') as hora,
        strftime('%d/%m/%Y', v.created_at, '-3 hours') as fecha,
        u.nombre as cajero,
        v.payment_method as metodo_pago,
        vd.barcode as codigo,
        vd.product_name as producto,
        vd.quantity as cantidad,
        vd.unit_price as precio_unitario,
        vd.unit_cost as costo_unitario,
        vd.subtotal as subtotal,
        (vd.subtotal - (vd.unit_cost * vd.quantity)) as ganancia_item,
        v.total_amount,
        v.profit
      FROM ventas v
      JOIN usuarios u ON v.user_id = u.id
      JOIN venta_detalles vd ON vd.sale_id = v.id
      WHERE DATE(v.created_at, '-3 hours') = ?
      ORDER BY v.created_at ASC, vd.id ASC
    `).all(targetDate);

    let totalRecaudado = 0;
    let totalCosto = 0;
    let totalGanancia = 0;
    let totalUnidades = 0;
    const ticketsSet = new Set();

    let csvContent = '\uFEFF';
    csvContent += 'Ticket,Fecha,Hora_GMT-3,Cajero,Metodo_Pago,Codigo_Barras,Producto,Cantidad,Precio_Unitario,Subtotal,Ganancia_Item\r\n';

    sales.forEach(row => {
      ticketsSet.add(row.ticket);
      totalUnidades += row.cantidad;
      totalRecaudado += row.subtotal;
      totalCosto += (row.costo_unitario * row.cantidad);
      totalGanancia += row.ganancia_item;

      const prodName = `"${row.producto.replace(/"/g, '""')}"`;
      const cajero = `"${row.cajero.replace(/"/g, '""')}"`;
      csvContent += `${row.ticket},${row.fecha},${row.hora},${cajero},${row.metodo_pago},${row.codigo},${prodName},${row.cantidad},${row.precio_unitario},${row.subtotal},${row.ganancia_item}\r\n`;
    });

    csvContent += '\r\n';
    csvContent += '=========================================================================\r\n';
    csvContent += 'RESUMEN Y TOTALES HASTA EL MOMENTO (ZONA HORARIA BUENOS AIRES GMT-3)\r\n';
    csvContent += `Fecha del Reporte,${targetDate}\r\n`;
    csvContent += `Total Tickets Emitidos,${ticketsSet.size}\r\n`;
    csvContent += `Total Unidades Vendidas,${totalUnidades}\r\n`;
    csvContent += `Total Recaudado (Ventas Brutas),$${totalRecaudado}\r\n`;
    csvContent += `Costo Total de Mercadería,$${totalCosto}\r\n`;
    csvContent += `GANANCIA NETA TOTAL HASTA EL MOMENTO,$${totalGanancia}\r\n`;
    csvContent += '=========================================================================\r\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_cierre_${targetDate}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exportando CSV:', error);
    res.status(500).send('Error al exportar CSV');
  }
});

module.exports = router;
