// Lógica del Punto de Venta (POS)
let cart = [];
let allProducts = [];
let selectedPaymentMethod = 'Efectivo';
let lastCompletedSale = null;
let storeConfig = {
  pos_nombre: 'Libreria Las Trillizas',
  pos_subtitulo: 'Libreria - Local Central',
  pos_ticket_pie: '¡Gracias por su compra! Conserve este ticket para cambios (30 días)'
};

// Sonido sutil para escaneo usando Web Audio API
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq = 880, duration = 0.08) {
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Si el navegador bloquea audio sin interacción previa
  }
}

// Inicialización de la pantalla
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar acceso (Cualquier usuario autenticado puede usar el POS)
  if (!Auth.checkAccess()) return;

  const currentUser = Auth.getUser();
  document.getElementById('cashier-name').textContent = currentUser.nombre;
  document.getElementById('cashier-role').textContent = currentUser.rol.toUpperCase();

  // Si es admin, mostrar enlace al Panel Admin
  if (currentUser.rol === 'admin') {
    document.getElementById('admin-link-container').classList.remove('hidden');
  }

  // Cargar configuración de la tienda
  await loadStoreConfig();

  // Cargar catálogo de productos
  loadProducts();

  // Enfocar input de escáner
  const barcodeInput = document.getElementById('barcode-input');
  barcodeInput.focus();

  // Evento escáner / buscador rápido con Enter
  barcodeInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeScan(barcodeInput.value.trim());
    }
  });

  // Búsqueda en tiempo real mientras escribe
  barcodeInput.addEventListener('input', (e) => {
    filterProductCatalog(e.target.value.trim());
  });

  // Atajos de teclado: F2 para cobrar, Escape para limpiar/cerrar
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (cart.length > 0) processCheckout();
    } else if (e.key === 'Escape') {
      closeTicketModal();
    }
  });

  // Escuchar cambio en monto recibido (Efectivo)
  document.getElementById('amount-received').addEventListener('input', calculateChange);
});

// Cargar productos desde la API
async function loadProducts() {
  try {
    const res = await Auth.apiFetch('/api/products');
    allProducts = await res.json();
    renderProductCatalog(allProducts);
  } catch (error) {
    console.error('Error al cargar productos:', error);
  }
}

// Renderizar catálogo de selección rápida
function renderProductCatalog(products) {
  const container = document.getElementById('product-catalog');
  container.innerHTML = '';

  if (products.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-6 text-slate-400">No se encontraron productos coincidentes.</div>';
    return;
  }

  products.forEach(p => {
    const isOutOfStock = p.stock <= 0;
    const card = document.createElement('div');
    card.className = `p-3 bg-white rounded-lg border ${isOutOfStock ? 'border-red-200 bg-red-50/30 opacity-60' : 'border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer'} transition flex flex-col justify-between`;
    
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start">
          <span class="text-xs font-mono text-slate-400">${p.barcode}</span>
          <span class="text-xs px-1.5 py-0.5 rounded font-medium ${p.stock <= 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
            Stock: ${p.stock}
          </span>
        </div>
        <h4 class="text-sm font-semibold text-slate-800 mt-1 line-clamp-2">${p.name}</h4>
      </div>
      <div class="mt-3 flex justify-between items-center pt-2 border-t border-slate-100">
        <span class="text-indigo-600 font-bold text-base">$${p.sale_price.toLocaleString('es-AR')}</span>
        <button class="px-2 py-1 text-xs bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded font-medium transition"
          ${isOutOfStock ? 'disabled' : ''}>
          ${isOutOfStock ? 'Sin Stock' : '+ Agregar'}
        </button>
      </div>
    `;

    if (!isOutOfStock) {
      card.addEventListener('click', () => addToCart(p));
    }

    container.appendChild(card);
  });
}

// Filtrar catálogo por texto
function filterProductCatalog(query) {
  if (!query) {
    renderProductCatalog(allProducts);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allProducts.filter(p => 
    p.name.toLowerCase().includes(q) || p.barcode.includes(q)
  );
  renderProductCatalog(filtered);
}

// Procesar lectura de código de barras
async function handleBarcodeScan(barcode) {
  if (!barcode) return;

  // Buscar coincidencia exacta por código de barras primero
  const exact = allProducts.find(p => p.barcode === barcode);

  if (exact) {
    addToCart(exact);
    playBeep(987, 0.08); // Tono agradable de confirmación
    document.getElementById('barcode-input').value = '';
    renderProductCatalog(allProducts);
  } else {
    // Si no está cargado localmente, consultar a la API
    try {
      const res = await Auth.apiFetch(`/api/products/barcode/${encodeURIComponent(barcode)}`);
      if (res.ok) {
        const prod = await res.json();
        addToCart(prod);
        playBeep(987, 0.08);
        document.getElementById('barcode-input').value = '';
        renderProductCatalog(allProducts);
      } else {
        playBeep(300, 0.15); // Tono de advertencia
        alert(`No se encontró ningún producto con el código: ${barcode}`);
      }
    } catch {
      playBeep(300, 0.15);
    }
  }
}

// Agregar producto al carrito
function addToCart(product) {
  if (product.stock <= 0) {
    alert(`El producto "${product.name}" no tiene stock disponible.`);
    return;
  }

  const existingIndex = cart.findIndex(item => item.product.id === product.id);

  if (existingIndex !== -1) {
    if (cart[existingIndex].quantity + 1 > product.stock) {
      alert(`No puedes agregar más unidades. Stock disponible: ${product.stock}`);
      return;
    }
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({
      product,
      quantity: 1
    });
  }

  renderCart();
}

// Actualizar cantidad de un ítem
function updateQuantity(productId, delta) {
  const itemIndex = cart.findIndex(item => item.product.id === productId);
  if (itemIndex === -1) return;

  const item = cart[itemIndex];
  const newQty = item.quantity + delta;

  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (newQty > item.product.stock) {
    alert(`Límite alcanzado. Solo hay ${item.product.stock} unidades disponibles.`);
    return;
  }

  item.quantity = newQty;
  renderCart();
}

// Cambiar cantidad con input numérico directo
function setQuantityDirect(productId, value) {
  const itemIndex = cart.findIndex(item => item.product.id === productId);
  if (itemIndex === -1) return;

  const qty = parseInt(value, 10);
  const item = cart[itemIndex];

  if (isNaN(qty) || qty <= 0) {
    item.quantity = 1;
  } else if (qty > item.product.stock) {
    alert(`Stock insuficiente. Disponible: ${item.product.stock}`);
    item.quantity = item.product.stock;
  } else {
    item.quantity = qty;
  }

  renderCart();
}

// Eliminar ítem del carrito
function removeFromCart(productId) {
  cart = cart.filter(item => item.product.id !== productId);
  renderCart();
}

// Vaciar carrito
function clearCart() {
  if (cart.length === 0) return;
  if (confirm('¿Desea vaciar el carrito actual?')) {
    cart = [];
    renderCart();
  }
}

// Renderizar la tabla del carrito
function renderCart() {
  const container = document.getElementById('cart-items');
  const countBadge = document.getElementById('cart-count');
  container.innerHTML = '';

  let total = 0;
  let totalItemsCount = 0;

  if (cart.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="py-12 text-center text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          El carrito está vacío. Escanee un código o seleccione productos.
        </td>
      </tr>
    `;
  } else {
    cart.forEach(item => {
      const subtotal = item.product.sale_price * item.quantity;
      total += subtotal;
      totalItemsCount += item.quantity;

      const row = document.createElement('tr');
      row.className = 'border-b border-slate-100 hover:bg-slate-50 transition';
      row.innerHTML = `
        <td class="py-3 px-3">
          <div class="font-medium text-slate-800 text-sm">${item.product.name}</div>
          <div class="text-xs text-slate-400 font-mono">${item.product.barcode}</div>
        </td>
        <td class="py-3 px-3 text-right text-sm text-slate-700 font-mono">
          $${item.product.sale_price.toLocaleString('es-AR')}
        </td>
        <td class="py-3 px-3">
          <div class="flex items-center justify-center space-x-1">
            <button onclick="updateQuantity(${item.product.id}, -1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition">-</button>
            <input type="number" min="1" max="${item.product.stock}" value="${item.quantity}"
              onchange="setQuantityDirect(${item.product.id}, this.value)"
              class="w-12 text-center text-sm font-semibold border border-slate-300 rounded py-1 focus:ring-1 focus:ring-indigo-500">
            <button onclick="updateQuantity(${item.product.id}, 1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition">+</button>
          </div>
        </td>
        <td class="py-3 px-3 text-right font-bold text-sm text-slate-900 font-mono">
          $${subtotal.toLocaleString('es-AR')}
        </td>
        <td class="py-3 px-3 text-center">
          <button onclick="removeFromCart(${item.product.id})" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition" title="Eliminar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </button>
        </td>
      `;
      container.appendChild(row);
    });
  }

  // Totales
  countBadge.textContent = totalItemsCount;
  document.getElementById('total-amount').textContent = `$${total.toLocaleString('es-AR')}`;
  document.getElementById('checkout-btn').disabled = cart.length === 0;

  calculateChange();
}

// Selector de método de pago
function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  const methods = ['Efectivo', 'Transferencia', 'QR'];
  methods.forEach(m => {
    const btn = document.getElementById(`btn-method-${m}`);
    if (m === method) {
      btn.className = 'flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-sm transition';
    } else {
      btn.className = 'flex-1 py-2 px-3 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition';
    }
  });

  const cashContainer = document.getElementById('cash-calculator');
  if (method === 'Efectivo') {
    cashContainer.classList.remove('hidden');
  } else {
    cashContainer.classList.add('hidden');
  }
}

// Calcular cambio para pago en efectivo
function calculateChange() {
  if (selectedPaymentMethod !== 'Efectivo') return;

  const total = cart.reduce((sum, item) => sum + (item.product.sale_price * item.quantity), 0);
  const received = parseFloat(document.getElementById('amount-received').value) || 0;
  const changeEl = document.getElementById('change-amount');

  const change = received - total;
  if (change >= 0) {
    changeEl.textContent = `$${change.toLocaleString('es-AR')}`;
    changeEl.className = 'text-green-600 font-bold';
  } else {
    changeEl.textContent = `Faltan: $${Math.abs(change).toLocaleString('es-AR')}`;
    changeEl.className = 'text-red-500 font-semibold';
  }
}

// Procesar cobro y venta
async function processCheckout() {
  if (cart.length === 0) return;

  const checkoutBtn = document.getElementById('checkout-btn');
  checkoutBtn.disabled = true;
  checkoutBtn.innerHTML = 'Procesando Venta...';

  const salePayload = {
    payment_method: selectedPaymentMethod,
    items: cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity
    }))
  };

  try {
    const response = await Auth.apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify(salePayload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo procesar la venta.');
    }

    playBeep(1200, 0.2); // Tono de éxito

    // Guardar venta completada para ticket
    lastCompletedSale = data.sale;

    // Abrir modal de ticket
    showTicketModal(data.sale);

    // Vaciar carrito y recargar catálogo para refrescar stock actualizado
    cart = [];
    renderCart();
    document.getElementById('amount-received').value = '';
    await loadProducts();

  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    checkoutBtn.disabled = cart.length === 0;
    checkoutBtn.innerHTML = `
      <span>Cobrar y Generar Ticket</span>
      <span class="text-xs bg-indigo-700 px-2 py-0.5 rounded">F2</span>
    `;
  }
}

async function loadStoreConfig() {
  try {
    const res = await Auth.apiFetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      storeConfig = { ...storeConfig, ...data };
      const titleEl = document.getElementById('store-name-header');
      if (titleEl && storeConfig.pos_nombre) {
        titleEl.textContent = storeConfig.pos_nombre;
      }
    }
  } catch (e) {
    console.warn('Usando configuración por defecto de tienda');
  }
}

// Mostrar modal de ticket
function showTicketModal(sale) {
  const modal = document.getElementById('ticket-modal');
  const ticketContent = document.getElementById('printable-ticket');

  const dateFormatted = Auth.formatDateTimeBA(sale.created_at);

  let itemsHtml = '';
  sale.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td class="text-left py-1">${item.product_name}<br><span style="font-size:10px; color:#666;">${item.barcode}</span></td>
        <td class="text-center py-1">${item.quantity}</td>
        <td class="text-right py-1">$${item.unit_price.toLocaleString('es-AR')}</td>
        <td class="text-right py-1 font-semibold">$${item.subtotal.toLocaleString('es-AR')}</td>
      </tr>
    `;
  });

  ticketContent.innerHTML = `
    <div class="watermark-wrapper">
      <!-- Marca de Agua Centrada del Logo -->
      <img src="img/logo.jpg" alt="Marca de agua" class="ticket-watermark">
      
      <div class="relative-content">
        <div class="text-center mb-2">
          <img src="img/logo.jpg" alt="Logo" class="w-12 h-12 mx-auto rounded-full object-contain mb-1 shadow-sm">
          <h2 class="text-base font-bold uppercase tracking-wider">${storeConfig.pos_nombre || 'Libreria Las Trillizas'}</h2>
          <p class="text-xs text-gray-600">${storeConfig.pos_subtitulo || 'Libreria - Local Central'}</p>
          <p class="text-[10px] text-gray-500">IVA Responsable Inscripto</p>
          <div class="ticket-divider"></div>
          <p class="text-xs font-semibold">TICKET FACTURA N° #${String(sale.id).padStart(6, '0')}</p>
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
            <span>TOTAL:</span>
            <span>$${sale.total_amount.toLocaleString('es-AR')}</span>
          </div>
          <div class="flex justify-between text-gray-600">
            <span>Método de Pago:</span>
            <span>${sale.payment_method}</span>
          </div>
        </div>

        <div class="ticket-divider"></div>

        <div class="text-center text-xs text-gray-500 mt-2 space-y-0.5">
          <p>${storeConfig.pos_ticket_pie || '¡Gracias por su compra!'}</p>
          <p class="font-mono text-[10px]">*** SISTEMA POS LOCAL ***</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

// Imprimir ticket usando el motor nativo del navegador
function printTicket() {
  window.print();
}

// Cerrar modal de ticket
function closeTicketModal() {
  document.getElementById('ticket-modal').classList.add('hidden');
  const barcodeInput = document.getElementById('barcode-input');
  barcodeInput.focus();
}
