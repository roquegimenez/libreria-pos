// Lógica del Panel de Administración
let currentTab = 'reports';
let currentPeriod = 'day';
let adminProducts = [];
let editingProductId = null;
let currentDailyClosureData = null;

document.addEventListener('DOMContentLoaded', () => {
  // Verificar acceso exclusivo de Administrador
  if (!Auth.checkAccess('admin')) return;

  const user = Auth.getUser();
  document.getElementById('admin-user-name').textContent = user.nombre;

  // Cargar sección inicial de Reportes
  loadReportsDashboard('day');

  // Buscador de productos en inventario
  const searchInput = document.getElementById('search-inventory');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterInventoryTable(e.target.value.trim());
    });
  }

  // Inicializar selector de fecha de cierre con la fecha local de hoy
  const datePicker = document.getElementById('closure-date-picker');
  if (datePicker) {
    const today = getLocalDateInputValue();
    datePicker.value = today;
  }

  // Cargar balance de turno actual
  loadCurrentCashShift();
});

function getLocalDateInputValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Cambio de pestañas
function switchTab(tab) {
  currentTab = tab;
  const tabs = ['reports', 'inventory', 'sales', 'settings'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const section = document.getElementById(`tab-content-${t}`);

    if (btn && section) {
      if (t === tab) {
        btn.className = 'py-3 px-4 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
        section.classList.remove('hidden');
      } else {
        btn.className = 'py-3 px-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center space-x-2';
        section.classList.add('hidden');
      }
    }
  });

  if (tab === 'reports') {
    loadReportsDashboard(currentPeriod);
    loadCurrentCashShift();
  } else if (tab === 'inventory') {
    loadInventory();
  } else if (tab === 'sales') {
    loadSalesHistory();
    loadCurrentCashShift();
    loadCashClosuresHistory();
  } else if (tab === 'settings') {
    loadSettingsTab();
  }
}

// ==========================================
// 1. REPORTES Y RESUMEN FINANCIERO
// ==========================================

async function loadReportsDashboard(period = 'day') {
  currentPeriod = period;

  // Actualizar botones de período
  ['day', 'week', 'month'].forEach(p => {
    const btn = document.getElementById(`btn-period-${p}`);
    if (btn) {
      if (p === period) {
        btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-sm';
      } else {
        btn.className = 'px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50';
      }
    }
  });

  try {
    const res = await Auth.apiFetch(`/api/reports/dashboard?period=${period}`);
    const data = await res.json();

    // Actualizar tarjetas KPI
    document.getElementById('metric-revenue').textContent = `$${data.summary.total_revenue.toLocaleString('es-AR')}`;
    document.getElementById('metric-profit').textContent = `$${data.summary.total_profit.toLocaleString('es-AR')}`;
    document.getElementById('metric-sales-count').textContent = data.summary.total_sales;
    document.getElementById('metric-low-stock').textContent = data.lowStockCount;

    // Calcular margen de ganancia porcentual global
    const marginPct = data.summary.total_revenue > 0 
      ? Math.round((data.summary.total_profit / data.summary.total_revenue) * 100) 
      : 0;
    document.getElementById('metric-margin-pct').textContent = `${marginPct}% de margen promedio`;

    // Desglose por método de pago
    renderPaymentBreakdown(data.byPaymentMethod, data.summary.total_revenue);

    // Top 5 productos
    renderTopProducts(data.topProducts);

  } catch (err) {
    console.error('Error cargando reportes:', err);
  }
}

function renderPaymentBreakdown(methods, totalRevenue) {
  const container = document.getElementById('payment-breakdown-container');
  container.innerHTML = '';

  if (!methods || methods.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">No hay ventas registradas en este período.</p>';
    return;
  }

  const icons = {
    'Efectivo': '💵',
    'Transferencia': '🏦',
    'QR': '📱'
  };

  methods.forEach(m => {
    const pct = totalRevenue > 0 ? Math.round((m.total / totalRevenue) * 100) : 0;
    const item = document.createElement('div');
    item.className = 'space-y-1';
    item.innerHTML = `
      <div class="flex justify-between text-xs font-semibold text-slate-700">
        <span>${icons[m.payment_method] || '💳'} ${m.payment_method} (${m.count} trans.)</span>
        <span>$${m.total.toLocaleString('es-AR')} (${pct}%)</span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div class="bg-indigo-600 h-2 rounded-full" style="width: ${pct}%"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderTopProducts(products) {
  const container = document.getElementById('top-products-container');
  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">No hay productos vendidos en este período.</p>';
    return;
  }

  products.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between py-2 border-b border-slate-100 last:border-0';
    item.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">${idx + 1}</span>
        <span class="text-xs font-semibold text-slate-800 truncate max-w-[200px]">${p.product_name}</span>
      </div>
      <div class="text-right">
        <span class="text-xs font-bold text-slate-900">${p.total_qty} u.</span>
        <span class="text-[10px] text-slate-400 block">$${p.total_sales.toLocaleString('es-AR')}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

// =========================================================================
// REPORTE AL MOMENTO / CIERRE DE CAJA DIARIO (LISTADO CON HORA Y GANANCIAS)
// =========================================================================

async function openDailyClosureModal(targetDate = null) {
  const dateInput = targetDate || document.getElementById('closure-date-picker')?.value || '';
  const url = dateInput ? `/api/reports/daily-closure?date=${encodeURIComponent(dateInput)}` : '/api/reports/daily-closure';

  try {
    const res = await Auth.apiFetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentDailyClosureData = data;
    renderDailyClosureModal(data);
    document.getElementById('daily-closure-modal').classList.remove('hidden');
  } catch (err) {
    alert(`Error al generar reporte: ${err.message}`);
  }
}

function renderDailyClosureModal(data) {
  const container = document.getElementById('printable-daily-closure');
  const [year, month, day] = data.date.split('-');
  const formattedDate = `${day}/${month}/${year}`;

  let rowsHtml = '';
  if (data.sales.length === 0) {
    rowsHtml = `<tr><td colspan="8" class="text-center py-6 text-slate-400 italic">No hay ventas registradas en esta fecha.</td></tr>`;
  } else {
    data.sales.forEach(sale => {
      sale.items.forEach((item, idx) => {
        rowsHtml += `
          <tr class="border-b border-slate-200 ${idx === 0 ? 'bg-slate-50/50' : ''}">
            <td class="py-2 px-3 font-mono font-bold text-slate-800">${idx === 0 ? `#${String(sale.id).padStart(5, '0')}` : ''}</td>
            <td class="py-2 px-3 font-mono text-slate-600">${idx === 0 ? sale.hora : ''}</td>
            <td class="py-2 px-3 text-slate-700">${idx === 0 ? `${sale.cajero_nombre}` : ''}</td>
            <td class="py-2 px-3 text-slate-700 font-medium">${item.product_name} <span class="text-xs text-slate-400 font-mono">(${item.barcode})</span></td>
            <td class="py-2 px-3 text-center font-bold text-slate-800">${item.quantity}</td>
            <td class="py-2 px-3 text-right font-mono text-slate-700">$${item.unit_price.toLocaleString('es-AR')}</td>
            <td class="py-2 px-3 text-right font-mono font-semibold text-slate-900">$${item.subtotal.toLocaleString('es-AR')}</td>
            <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700">+$${item.item_profit.toLocaleString('es-AR')}</td>
          </tr>
        `;
      });
    });
  }

  container.innerHTML = `
    <div class="watermark-wrapper">
      <!-- Marca de Agua Centrada del Logo en Reportes -->
      <img src="img/logo.jpg" alt="Marca de agua" class="report-watermark">
      
      <div class="relative-content">
        <div class="border-b-2 border-slate-800 pb-4 mb-4">
          <div class="flex justify-between items-start">
            <div class="flex items-center space-x-3">
              <img src="img/logo.jpg" alt="Logo Las Trillizas" class="w-14 h-14 rounded-xl object-contain shadow-sm border border-slate-200 p-0.5 bg-white">
              <div>
                <h1 class="text-xl font-bold uppercase tracking-wider text-slate-900">${data.store.pos_nombre || 'Libreria Las Trillizas'}</h1>
                <p class="text-xs text-slate-500">${data.store.pos_subtitulo || 'Libreria - Local Central'}</p>
                <h2 class="text-base font-bold text-indigo-700 mt-1">REPORTE DETALLADO DE VENTAS Y CIERRE DE CAJA</h2>
              </div>
            </div>
            <div class="text-right text-xs">
              <p class="font-bold text-slate-700">Fecha del Reporte: <span class="font-mono text-slate-900 font-black">${formattedDate}</span></p>
              <p class="text-slate-500">Hora de Generación: <span class="font-mono">${data.generatedAt}</span></p>
              <p class="text-slate-500">Estado: <span class="text-emerald-700 font-bold">Hasta el Momento</span></p>
            </div>
          </div>
        </div>

    <!-- Tabla de Ítems Vendidos con Hora -->
    <table class="w-full text-left border-collapse text-xs mb-6">
      <thead>
        <tr class="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b-2 border-slate-300">
          <th class="py-2.5 px-3">Ticket</th>
          <th class="py-2.5 px-3">Hora</th>
          <th class="py-2.5 px-3">Cajero</th>
          <th class="py-2.5 px-3">Producto Vendido</th>
          <th class="py-2.5 px-3 text-center">Cant.</th>
          <th class="py-2.5 px-3 text-right">P. Unit.</th>
          <th class="py-2.5 px-3 text-right">Subtotal</th>
          <th class="py-2.5 px-3 text-right">Ganancia Neta</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Resumen Final y Ganancia Neta Total -->
    <div class="bg-slate-50 border-2 border-slate-300 rounded-xl p-4 text-xs">
      <h3 class="font-bold uppercase tracking-wider text-slate-700 mb-3 border-b border-slate-200 pb-1">
        Balance y Totales Acumulados Hasta el Momento
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <span class="text-slate-500 block">Total Tickets Emitidos:</span>
          <span class="font-bold font-mono text-slate-800 text-sm">${data.summary.totalSalesCount} tickets</span>
        </div>
        <div>
          <span class="text-slate-500 block">Total Unidades Vendidas:</span>
          <span class="font-bold font-mono text-slate-800 text-sm">${data.summary.totalUnitsSold} unidades</span>
        </div>
        <div>
          <span class="text-slate-500 block">Efectivo en Caja:</span>
          <span class="font-bold font-mono text-slate-800 text-sm">$${(data.summary.paymentTotals['Efectivo'] || 0).toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span class="text-slate-500 block">Transf. / QR:</span>
          <span class="font-bold font-mono text-slate-800 text-sm">$${((data.summary.paymentTotals['Transferencia'] || 0) + (data.summary.paymentTotals['QR'] || 0)).toLocaleString('es-AR')}</span>
        </div>
      </div>

      <div class="border-t-2 border-dashed border-slate-300 pt-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <span class="text-slate-500">Costo de Mercadería Vendida: </span>
          <span class="font-mono font-semibold text-slate-700">$${data.summary.totalCost.toLocaleString('es-AR')}</span>
        </div>
        <div class="text-right flex items-center space-x-6">
          <div>
            <span class="text-slate-600 block text-[11px] font-semibold">TOTAL RECAUDADO (BRUTO)</span>
            <span class="text-lg font-black font-mono text-slate-900">$${data.summary.totalRevenue.toLocaleString('es-AR')}</span>
          </div>
          <div class="bg-emerald-100 border border-emerald-300 px-4 py-2 rounded-lg">
            <span class="text-emerald-800 block text-[11px] font-black uppercase tracking-wider">GANANCIA NETA TOTAL</span>
            <span class="text-xl font-black font-mono text-emerald-700">+$${data.summary.totalProfit.toLocaleString('es-AR')}</span>
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  `;
}

function closeDailyClosureModal() {
  document.getElementById('daily-closure-modal').classList.add('hidden');
}

function printDailyClosure() {
  window.print();
}

async function downloadDailyClosureCSV() {
  const dateInput = currentDailyClosureData?.date || document.getElementById('closure-date-picker')?.value || '';
  const url = dateInput ? `/api/reports/daily-closure/csv?date=${encodeURIComponent(dateInput)}` : '/api/reports/daily-closure/csv';

  try {
    const res = await Auth.apiFetch(url);
    if (!res.ok) throw new Error('No se pudo descargar el archivo CSV');

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `reporte_cierre_${dateInput || new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ==========================================
// 2. GESTIÓN DE PRODUCTOS E INVENTARIO
// ==========================================

async function loadInventory() {
  try {
    const res = await Auth.apiFetch('/api/products');
    adminProducts = await res.json();
    renderInventoryTable(adminProducts);
  } catch (err) {
    console.error('Error cargando inventario:', err);
  }
}

function renderInventoryTable(products) {
  const tbody = document.getElementById('inventory-table-body');
  tbody.innerHTML = '';

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No se encontraron productos.</td></tr>`;
    return;
  }

  products.forEach(p => {
    const margin = p.cost_price > 0 ? Math.round(((p.sale_price - p.cost_price) / p.cost_price) * 100) : 0;
    const isCritical = p.stock <= 5;

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition text-sm';
    tr.innerHTML = `
      <td class="py-3 px-4 font-mono text-xs text-slate-500">${p.barcode}</td>
      <td class="py-3 px-4 font-medium text-slate-900">${p.name}</td>
      <td class="py-3 px-4 font-mono text-slate-600 text-right">$${p.cost_price.toLocaleString('es-AR')}</td>
      <td class="py-3 px-4 font-mono font-bold text-indigo-700 text-right">$${p.sale_price.toLocaleString('es-AR')}</td>
      <td class="py-3 px-4 text-center">
        <span class="text-xs font-semibold px-2 py-0.5 rounded ${margin > 40 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          +${margin}%
        </span>
      </td>
      <td class="py-3 px-4 text-center">
        <span class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${isCritical ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700'}">
          ${isCritical ? '⚠️ ' : ''}${p.stock} u.
        </span>
      </td>
      <td class="py-3 px-4 text-center space-x-2">
        <button onclick="openEditProductModal(${p.id})" class="text-indigo-600 hover:text-indigo-900 font-medium text-xs">Editar</button>
        <button onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 font-medium text-xs">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterInventoryTable(query) {
  if (!query) {
    renderInventoryTable(adminProducts);
    return;
  }
  const q = query.toLowerCase();
  const filtered = adminProducts.filter(p => 
    p.name.toLowerCase().includes(q) || p.barcode.includes(q)
  );
  renderInventoryTable(filtered);
}

// Abrir modal de nuevo producto
function openNewProductModal() {
  editingProductId = null;
  document.getElementById('product-modal-title').textContent = 'Registrar Nuevo Producto';
  document.getElementById('product-form').reset();
  document.getElementById('prod-barcode').removeAttribute('readonly');
  document.getElementById('product-modal').classList.remove('hidden');
  document.getElementById('prod-name').focus();
}

// Abrir modal de edición
function openEditProductModal(id) {
  const prod = adminProducts.find(p => p.id === id);
  if (!prod) return;

  editingProductId = id;
  document.getElementById('product-modal-title').textContent = 'Editar Producto';
  document.getElementById('prod-barcode').value = prod.barcode;
  document.getElementById('prod-name').value = prod.name;
  document.getElementById('prod-cost').value = prod.cost_price;
  document.getElementById('prod-sale').value = prod.sale_price;
  document.getElementById('prod-stock').value = prod.stock;

  document.getElementById('product-modal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.add('hidden');
}

// Guardar producto (Crear o Editar)
async function saveProduct(e) {
  e.preventDefault();

  const barcode = document.getElementById('prod-barcode').value.trim();
  const name = document.getElementById('prod-name').value.trim();
  const cost_price = parseFloat(document.getElementById('prod-cost').value);
  const sale_price = parseFloat(document.getElementById('prod-sale').value);
  const stock = parseInt(document.getElementById('prod-stock').value, 10);

  if (!barcode || !name || isNaN(cost_price) || isNaN(sale_price) || isNaN(stock)) {
    alert('Por favor complete todos los campos con valores válidos.');
    return;
  }

  const payload = { barcode, name, cost_price, sale_price, stock };

  try {
    let res;
    if (editingProductId) {
      res = await Auth.apiFetch(`/api/products/${editingProductId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      res = await Auth.apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al guardar producto');
    }

    closeProductModal();
    await loadInventory();
    alert(editingProductId ? 'Producto actualizado con éxito.' : 'Producto creado con éxito.');
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Eliminar producto
async function deleteProduct(id, name) {
  if (!confirm(`¿Está seguro de eliminar el producto "${name}"? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const res = await Auth.apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    await loadInventory();
    alert('Producto eliminado correctamente.');
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ==========================================
// 3. MOVIMIENTO DE CAJA Y DETALLE DE VENTAS
// ==========================================

async function loadSalesHistory() {
  try {
    const res = await Auth.apiFetch('/api/sales?limit=100');
    const sales = await res.json();
    renderSalesHistory(sales);
  } catch (err) {
    console.error('Error cargando historial de caja:', err);
  }
}

function renderSalesHistory(sales) {
  const tbody = document.getElementById('sales-table-body');
  tbody.innerHTML = '';

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No se encontraron movimientos de venta.</td></tr>`;
    return;
  }

  const methodBadges = {
    'Efectivo': 'bg-emerald-100 text-emerald-800',
    'Transferencia': 'bg-blue-100 text-blue-800',
    'QR': 'bg-purple-100 text-purple-800'
  };

  sales.forEach(s => {
    const dateFormatted = s.fecha_hora_ba || Auth.formatDateTimeBA(s.created_at);

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition text-sm';
    tr.innerHTML = `
      <td class="py-3 px-4 font-mono font-semibold text-slate-700">#${String(s.id).padStart(5, '0')}</td>
      <td class="py-3 px-4 text-slate-600 font-mono">${dateFormatted} hs</td>
      <td class="py-3 px-4 font-medium text-slate-800">${s.cajero_nombre} <span class="text-xs text-slate-400">(${s.cajero_user})</span></td>
      <td class="py-3 px-4 text-center">
        <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${methodBadges[s.payment_method] || 'bg-slate-100 text-slate-800'}">
          ${s.payment_method}
        </span>
      </td>
      <td class="py-3 px-4 font-mono font-bold text-slate-900 text-right">$${s.total_amount.toLocaleString('es-AR')}</td>
      <td class="py-3 px-4 font-mono font-semibold text-emerald-600 text-right">+$${s.profit.toLocaleString('es-AR')}</td>
      <td class="py-3 px-4 text-center">
        <button onclick="viewSaleDetail(${s.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-medium text-xs rounded transition">
          Ver Ticket
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// CONTROL DE TURNO Y BOTÓN CERRAR CAJA
// ==========================================

async function loadCurrentCashShift() {
  try {
    const res = await Auth.apiFetch('/api/reports/caja-actual');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const shift = data.currentShift;
    const totalEl = document.getElementById('shift-total-amount');
    const countEl = document.getElementById('shift-sales-count');
    const efectivoEl = document.getElementById('shift-efectivo');
    const transfEl = document.getElementById('shift-transferencia');
    const qrEl = document.getElementById('shift-qr');
    const profitEl = document.getElementById('shift-profit');
    const sinceEl = document.getElementById('shift-since-text');

    if (totalEl) totalEl.textContent = `$${shift.total_amount.toLocaleString('es-AR')}`;
    if (countEl) countEl.textContent = `${shift.sales_count} tickets emitidos`;
    if (efectivoEl) efectivoEl.textContent = `$${shift.efectivo.toLocaleString('es-AR')}`;
    if (transfEl) transfEl.textContent = `$${shift.transferencia.toLocaleString('es-AR')}`;
    if (qrEl) qrEl.textContent = `$${shift.qr.toLocaleString('es-AR')}`;
    if (profitEl) profitEl.textContent = `+$${shift.total_profit.toLocaleString('es-AR')}`;
    if (sinceEl) sinceEl.textContent = `${data.ultimoCierreTexto}`;
  } catch (err) {
    console.error('Error cargando caja actual:', err);
  }
}

async function promptCloseCashRegister() {
  try {
    const res = await Auth.apiFetch('/api/reports/caja-actual');
    const data = await res.json();
    const shift = data.currentShift;

    const mensaje = `¿Confirma realizar el CIERRE DE CAJA del turno actual?\n\n` +
      `• Total Recaudado en este Turno: $${shift.total_amount.toLocaleString('es-AR')}\n` +
      `• Efectivo en Caja: $${shift.efectivo.toLocaleString('es-AR')}\n` +
      `• Transferencia: $${shift.transferencia.toLocaleString('es-AR')}\n` +
      `• QR: $${shift.qr.toLocaleString('es-AR')}\n` +
      `• Cantidad de Ventas: ${shift.sales_count} tickets\n\n` +
      `⚠️ Al confirmar, el contador del turno volverá a $0 para separar las ganancias del siguiente día/turno.\n` +
      `El stock de productos y los reportes históricos NO se verán alterados.`;

    if (!confirm(mensaje)) return;

    const closeRes = await Auth.apiFetch('/api/reports/cerrar-caja', {
      method: 'POST',
      body: JSON.stringify({ notas: 'Cierre de turno realizado desde el panel' })
    });
    const closeData = await closeRes.json();
    if (!closeRes.ok) throw new Error(closeData.error);

    alert(`✅ ${closeData.message}`);
    await loadCurrentCashShift();
    await loadCashClosuresHistory();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function loadCashClosuresHistory() {
  const tbody = document.getElementById('closures-history-table-body');
  if (!tbody) return;

  try {
    const res = await Auth.apiFetch('/api/reports/historial-cierres');
    const closures = await res.json();
    tbody.innerHTML = '';

    if (!closures || closures.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Aún no se han registrado cierres de caja anteriores.</td></tr>`;
      return;
    }

    closures.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition';
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-mono font-bold text-slate-700">#${String(c.id).padStart(4, '0')}</td>
        <td class="py-2.5 px-3 font-mono text-slate-600">${c.fecha_hora} hs</td>
        <td class="py-2.5 px-3 text-slate-700 font-medium">${c.admin_nombre} <span class="text-[10px] text-slate-400">(${c.admin_user})</span></td>
        <td class="py-2.5 px-3 text-center font-bold text-slate-800">${c.sales_count}</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-700">$${c.efectivo_amount.toLocaleString('es-AR')}</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-700">$${(c.transferencia_amount + c.qr_amount).toLocaleString('es-AR')}</td>
        <td class="py-2.5 px-3 text-right font-mono font-black text-slate-900">$${c.total_amount.toLocaleString('es-AR')}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">+$${c.total_profit.toLocaleString('es-AR')}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error cargando historial de cierres:', err);
  }
}

// Ver detalle completo de venta en formato ticket
async function viewSaleDetail(saleId) {
  try {
    const res = await Auth.apiFetch(`/api/sales/${saleId}`);
    const sale = await res.json();
    if (!res.ok) throw new Error(sale.error);

    showSaleTicketModal(sale);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function showSaleTicketModal(sale) {
  const modal = document.getElementById('sale-detail-modal');
  const ticket = document.getElementById('admin-printable-ticket');

  let store = { pos_nombre: 'Libreria Las Trillizas', pos_subtitulo: 'Libreria - Local Central' };
  try {
    const configRes = await Auth.apiFetch('/api/settings');
    if (configRes.ok) store = await configRes.json();
  } catch(e) {}

  const dateFormatted = sale.fecha_hora_ba || Auth.formatDateTimeBA(sale.created_at);

  let itemsHtml = '';
  sale.items.forEach(i => {
    itemsHtml += `
      <tr>
        <td class="text-left py-1">${i.product_name}<br><span style="font-size:10px; color:#666;">${i.barcode}</span></td>
        <td class="text-center py-1">${i.quantity}</td>
        <td class="text-right py-1">$${i.unit_price.toLocaleString('es-AR')}</td>
        <td class="text-right py-1 font-semibold">$${i.subtotal.toLocaleString('es-AR')}</td>
      </tr>
    `;
  });

  ticket.innerHTML = `
    <div class="watermark-wrapper">
      <!-- Marca de Agua Centrada del Logo -->
      <img src="img/logo.jpg" alt="Marca de agua" class="ticket-watermark">

      <div class="relative-content">
        <div class="text-center mb-2">
          <img src="img/logo.jpg" alt="Logo" class="w-12 h-12 mx-auto rounded-full object-contain mb-1 shadow-sm">
          <h2 class="text-base font-bold uppercase tracking-wider">${store.pos_nombre || 'Libreria Las Trillizas'}</h2>
          <p class="text-xs text-gray-600">${store.pos_subtitulo || 'Libreria - Local Central'}</p>
          <div class="ticket-divider"></div>
          <p class="text-xs font-semibold">COPIA DE TICKET N° #${String(sale.id).padStart(6, '0')}</p>
          <p class="text-xs text-gray-500">Fecha/Hora: ${dateFormatted}</p>
          <p class="text-xs text-gray-500">Cajero: ${sale.cajero_nombre} (${sale.cajero_user})</p>
        </div>

        <div class="ticket-divider"></div>

        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-300">
              <th class="text-left pb-1">Desc.</th>
              <th class="text-center pb-1">Cant.</th>
              <th class="text-right pb-1">P.Unit</th>
              <th class="text-right pb-1">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="ticket-divider"></div>

        <div class="space-y-1 text-xs">
          <div class="flex justify-between font-bold text-sm">
            <span>TOTAL COBRADO:</span>
            <span>$${sale.total_amount.toLocaleString('es-AR')}</span>
          </div>
          <div class="flex justify-between text-gray-600">
            <span>Método de Pago:</span>
            <span>${sale.payment_method}</span>
          </div>
          <div class="flex justify-between text-emerald-700 font-semibold border-t pt-1">
            <span>Ganancia Neta Calculada:</span>
            <span>+$${sale.profit.toLocaleString('es-AR')}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeSaleDetailModal() {
  document.getElementById('sale-detail-modal').classList.add('hidden');
}

function printAdminTicket() {
  window.print();
}

// =========================================================================
// 4. CONFIGURACIÓN: PUNTO DE VENTA Y GESTIÓN DE CREDENCIALES
// =========================================================================

async function loadSettingsTab() {
  try {
    // 1. Cargar datos del punto de venta
    const resConfig = await Auth.apiFetch('/api/settings');
    const config = await resConfig.json();

    document.getElementById('setting-pos-nombre').value = config.pos_nombre || '';
    document.getElementById('setting-pos-subtitulo').value = config.pos_subtitulo || '';
    document.getElementById('setting-pos-ticket-pie').value = config.pos_ticket_pie || '';
    document.getElementById('setting-clave-maestra').value = config.clave_maestra || 'TRILLIZAS-RECUPERAR';

    // 2. Cargar usuarios para gestión de credenciales
    const resUsers = await Auth.apiFetch('/api/settings/users');
    const users = await resUsers.json();
    renderUsersManagement(users);
  } catch (err) {
    console.error('Error cargando configuración:', err);
  }
}

function renderUsersManagement(users) {
  const container = document.getElementById('users-management-container');
  container.innerHTML = '';

  users.forEach(u => {
    const isOwner = u.rol === 'admin';
    const card = document.createElement('div');
    card.className = 'bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4';
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded ${isOwner ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}">
            ${isOwner ? '👑 Administrador' : '💼 Empleado'}
          </span>
          <span class="text-xs font-mono text-slate-400">ID: #${u.id}</span>
        </div>
        <h4 class="font-bold text-slate-800 text-base mb-3">${u.nombre}</h4>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Nombre Completo:</label>
            <input type="text" id="user-nombre-${u.id}" value="${u.nombre}"
              class="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Usuario de Acceso:</label>
            <input type="text" id="user-username-${u.id}" value="${u.username}"
              class="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-mono">
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Nueva Contraseña (dejar en blanco para no cambiar):</label>
            <input type="password" id="user-pass-${u.id}" placeholder="Nueva contraseña..."
              class="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
        </div>
      </div>

      <button onclick="saveUserCredentials(${u.id})"
        class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
        Actualizar Credenciales de ${u.username}
      </button>
    `;
    container.appendChild(card);
  });
}

// Guardar configuración del punto de venta
async function saveStoreSettings(e) {
  e.preventDefault();

  const pos_nombre = document.getElementById('setting-pos-nombre').value.trim();
  const pos_subtitulo = document.getElementById('setting-pos-subtitulo').value.trim();
  const pos_ticket_pie = document.getElementById('setting-pos-ticket-pie').value.trim();
  const clave_maestra = document.getElementById('setting-clave-maestra').value.trim();

  if (!pos_nombre) {
    alert('El nombre del punto de venta es obligatorio.');
    return;
  }

  try {
    const res = await Auth.apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ pos_nombre, pos_subtitulo, pos_ticket_pie, clave_maestra })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert('Configuración y Clave Maestra guardadas con éxito.');
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Guardar credenciales de un usuario específico
async function saveUserCredentials(userId) {
  const nombre = document.getElementById(`user-nombre-${userId}`).value.trim();
  const username = document.getElementById(`user-username-${userId}`).value.trim();
  const password = document.getElementById(`user-pass-${userId}`).value.trim();

  if (!nombre || !username) {
    alert('Nombre y usuario son requeridos.');
    return;
  }

  try {
    const res = await Auth.apiFetch(`/api/settings/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre, username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById(`user-pass-${userId}`).value = '';
    alert(data.message);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}
