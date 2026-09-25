const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../auth');

router.use(authenticateToken);

// POST /api/sales - Procesar una venta (Transaccional)
router.post('/', (req, res) => {
  const { payment_method, items } = req.body;
  const userId = req.user.id;

  // Validaciones de entrada
  const validMethods = ['Efectivo', 'Transferencia', 'QR'];
  if (!validMethods.includes(payment_method)) {
    return res.status(400).json({ error: 'Método de pago inválido. Opciones: Efectivo, Transferencia, QR.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El carrito no puede estar vacío.' });
  }

  // Ejecución transaccional atómica con better-sqlite3
  const executeSaleTransaction = db.transaction(() => {
    let totalAmount = 0;
    let totalCost = 0;
    const processedItems = [];

    // 1. Validar existencia y stock de cada ítem
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Cantidad inválida para el producto ID: ${item.productId}`);
      }

      const product = db.prepare('SELECT * FROM productos WHERE id = ?').get(item.productId);
      if (!product) {
        throw new Error(`El producto con ID ${item.productId} no existe.`);
      }

      if (product.stock < qty) {
        throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${qty}.`);
      }

      const subtotal = product.sale_price * qty;
      const subtotalCost = product.cost_price * qty;

      totalAmount += subtotal;
      totalCost += subtotalCost;

      processedItems.push({
        product,
        quantity: qty,
        unit_price: product.sale_price,
        unit_cost: product.cost_price,
        subtotal
      });
    }

    const profit = totalAmount - totalCost;

    // 2. Insertar encabezado de venta
    const insertSaleStmt = db.prepare(`
      INSERT INTO ventas (user_id, payment_method, total_amount, total_cost, profit)
      VALUES (?, ?, ?, ?, ?)
    `);
    const saleResult = insertSaleStmt.run(userId, payment_method, totalAmount, totalCost, profit);
    const saleId = saleResult.lastInsertRowid;

    // 3. Insertar detalles y descontar stock
    const insertDetailStmt = db.prepare(`
      INSERT INTO venta_detalles (sale_id, product_id, product_name, barcode, quantity, unit_price, unit_cost, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStockStmt = db.prepare(`
      UPDATE productos 
      SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    for (const item of processedItems) {
      insertDetailStmt.run(
        saleId,
        item.product.id,
        item.product.name,
        item.product.barcode,
        item.quantity,
        item.unit_price,
        item.unit_cost,
        item.subtotal
      );

      updateStockStmt.run(item.quantity, item.product.id);
    }

    return {
      saleId,
      totalAmount,
      totalCost,
      profit,
      payment_method,
      items: processedItems
    };
  });

  try {
    const saleData = executeSaleTransaction();

    // Obtener la venta completa con fecha y nombre de cajero para el ticket
    const fullSale = db.prepare(`
      SELECT 
        v.id,
        v.payment_method,
        v.total_amount,
        v.created_at,
        u.nombre as cajero_nombre,
        u.username as cajero_user
      FROM ventas v
      JOIN usuarios u ON v.user_id = u.id
      WHERE v.id = ?
    `).get(saleData.saleId);

    const details = db.prepare(`
      SELECT product_name, barcode, quantity, unit_price, subtotal
      FROM venta_detalles
      WHERE sale_id = ?
    `).all(saleData.saleId);

    res.status(201).json({
      message: 'Venta registrada con éxito.',
      sale: {
        ...fullSale,
        items: details
      }
    });
  } catch (error) {
    console.error('Error procesando venta:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/sales - Listar movimiento de caja detallado (Solo Admin)
router.get('/', requireAdmin, (req, res) => {
  const { date, startDate, endDate, paymentMethod, limit = 100 } = req.query;

  try {
    let query = `
      SELECT 
        v.id,
        v.payment_method,
        v.total_amount,
        v.total_cost,
        v.profit,
        v.created_at,
        strftime('%d/%m/%Y %H:%M:%S', v.created_at, '-3 hours') as fecha_hora_ba,
        u.nombre as cajero_nombre,
        u.username as cajero_user,
        (SELECT COUNT(*) FROM venta_detalles vd WHERE vd.sale_id = v.id) as item_count
      FROM ventas v
      JOIN usuarios u ON v.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ` AND DATE(v.created_at, '-3 hours') = ?`;
      params.push(date);
    } else if (startDate && endDate) {
      query += ` AND DATE(v.created_at, '-3 hours') BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (paymentMethod && paymentMethod !== 'Todos') {
      query += ` AND v.payment_method = ?`;
      params.push(paymentMethod);
    }

    query += ` ORDER BY v.created_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10) || 100);

    const sales = db.prepare(query).all(...params);
    res.json(sales);
  } catch (error) {
    console.error('Error listando ventas:', error);
    res.status(500).json({ error: 'Error al consultar movimientos de caja.' });
  }
});

// GET /api/sales/:id - Ver detalle completo de una venta específica (Admin o Empleado para reimpresión)
router.get('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const sale = db.prepare(`
      SELECT 
        v.id,
        v.payment_method,
        v.total_amount,
        v.total_cost,
        v.profit,
        v.created_at,
        u.nombre as cajero_nombre,
        u.username as cajero_user
      FROM ventas v
      JOIN usuarios u ON v.user_id = u.id
      WHERE v.id = ?
    `).get(id);

    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    // Si es empleado, ocultamos total_cost y profit
    if (req.user.rol !== 'admin') {
      delete sale.total_cost;
      delete sale.profit;
    }

    const items = db.prepare(`
      SELECT id, product_id, product_name, barcode, quantity, unit_price, subtotal
      FROM venta_detalles
      WHERE sale_id = ?
    `).all(id);

    res.json({
      ...sale,
      items
    });
  } catch (error) {
    console.error('Error consultando detalle de venta:', error);
    res.status(500).json({ error: 'Error al obtener la venta.' });
  }
});

module.exports = router;
