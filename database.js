const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'libreria.db');
const db = new Database(dbPath);

// Configurar SQLite para máxima integridad y concurrencia
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // 1. Tabla de Usuarios
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT CHECK(rol IN ('admin', 'empleado')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabla de Productos
  db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Tabla de Ventas (Encabezado)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('Efectivo', 'Transferencia', 'QR')) NOT NULL,
      total_amount REAL NOT NULL,
      total_cost REAL NOT NULL,
      profit REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES usuarios (id)
    );
  `);

  // 4. Tabla de Detalles de Venta (Items vendidos con foto histórica de precios)
  db.exec(`
    CREATE TABLE IF NOT EXISTS venta_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      barcode TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES ventas (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES productos (id) ON DELETE SET NULL
    );
  `);

  // 5. Tabla de Configuración del Punto de Venta
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  // 6. Tabla de Historial de Cierres de Caja (Turnos de Dinero)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cierres_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      total_profit REAL NOT NULL,
      sales_count INTEGER NOT NULL,
      efectivo_amount REAL NOT NULL,
      transferencia_amount REAL NOT NULL,
      qr_amount REAL NOT NULL,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES usuarios (id)
    );
  `);

  // Crear índices para optimizar búsquedas por código de barras y fechas
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_productos_barcode ON productos(barcode);
    CREATE INDEX IF NOT EXISTS idx_ventas_created_at ON ventas(created_at);
    CREATE INDEX IF NOT EXISTS idx_venta_detalles_sale_id ON venta_detalles(sale_id);
    CREATE INDEX IF NOT EXISTS idx_cierres_caja_created_at ON cierres_caja(created_at);
  `);

  // Sembrar datos iniciales si no existen usuarios
  seedInitialData();
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM usuarios').get().count;

  if (userCount === 0) {
    console.log('🌱 Sembrando datos iniciales en la base de datos...');

    const insertUser = db.prepare(`
      INSERT INTO usuarios (username, password, nombre, rol)
      VALUES (?, ?, ?, ?)
    `);

    // Contraseña admin: admin123
    const adminHash = bcrypt.hashSync('admin123', 10);
    insertUser.run('admin', adminHash, 'Administrador General', 'admin');

    // Contraseña empleado: cajero123
    const empleadoHash = bcrypt.hashSync('cajero123', 10);
    insertUser.run('cajero', empleadoHash, 'Cajero de Turno', 'empleado');

    console.log('✅ Usuarios iniciales creados:');
    console.log('   - Admin:    admin  / admin123');
    console.log('   - Empleado: cajero / cajero123');
  }

  const productCount = db.prepare('SELECT COUNT(*) as count FROM productos').get().count;

  if (productCount === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO productos (barcode, name, cost_price, sale_price, stock)
      VALUES (?, ?, ?, ?, ?)
    `);

    const seedProducts = [
      { barcode: '9780307474728', name: 'Cien Años de Soledad - G. García Márquez', cost_price: 12000, sale_price: 18500, stock: 15 },
      { barcode: '9789871138012', name: 'El Principito - Antoine de Saint-Exupéry', cost_price: 6500, sale_price: 10500, stock: 24 },
      { barcode: '9788478884452', name: 'Harry Potter y la Piedra Filosofal', cost_price: 14500, sale_price: 22000, stock: 8 },
      { barcode: '9789500732895', name: 'Rayuela - Julio Cortázar', cost_price: 13000, sale_price: 19800, stock: 4 }, // Stock bajo para pruebas
      { barcode: '7791234560011', name: 'Cuaderno Universitario A4 Rayado 80h', cost_price: 2100, sale_price: 3600, stock: 45 },
      { barcode: '7791234560028', name: 'Cuaderno Universitario A4 Cuadriculado 80h', cost_price: 2100, sale_price: 3600, stock: 30 },
      { barcode: '7033012965412', name: 'Bolígrafo BIC Cristal Azul 1.0mm', cost_price: 350, sale_price: 750, stock: 120 },
      { barcode: '7033012965429', name: 'Bolígrafo BIC Cristal Negro 1.0mm', cost_price: 350, sale_price: 750, stock: 95 },
      { barcode: '4007817304563', name: 'Resaltador Flúor Faber-Castell Amarillo', cost_price: 850, sale_price: 1600, stock: 3 }, // Stock crítico
      { barcode: '7798083810145', name: 'Cinta Adhesiva Transparente 18mm x 30m', cost_price: 600, sale_price: 1200, stock: 18 }
    ];

    const seedTransaction = db.transaction((products) => {
      for (const prod of products) {
        insertProduct.run(prod.barcode, prod.name, prod.cost_price, prod.sale_price, prod.stock);
      }
    });

    seedTransaction(seedProducts);
    console.log(`✅ ${seedProducts.length} productos de librería cargados inicialmente.`);
  }

  // Configuración predeterminada de la tienda/punto de venta
  const configCount = db.prepare('SELECT COUNT(*) as count FROM configuracion').get().count;
  if (configCount === 0) {
    const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
    insertConfig.run('pos_nombre', 'Libreria Las Trillizas');
    insertConfig.run('pos_subtitulo', 'Libreria');
    insertConfig.run('pos_ticket_pie', '¡Gracias por su compra! Conserve este ticket para cambios (30 días)');
  }

  // Asegurar que exista la clave maestra de recuperación
  const insertMasterKey = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
  insertMasterKey.run('clave_maestra', 'TRILLIZAS-RECUPERAR');
}

// Inicializar la base de datos al importar el módulo
initDatabase();

module.exports = db;
