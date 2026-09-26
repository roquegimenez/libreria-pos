const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'libreria.db');
const db = new Database(dbPath);

const mode = process.argv[2] || '--ventas';

console.log('========================================================');
console.log('🧹 Herramienta de Limpieza - Librería Las Trillizas');
console.log('========================================================\n');

db.transaction(() => {
  // 1. Siempre eliminar historial de ventas y cierres de caja
  db.prepare('DELETE FROM venta_detalles').run();
  db.prepare('DELETE FROM ventas').run();
  db.prepare('DELETE FROM cierres_caja').run();
  
  // 2. Limpiar marca del último cierre y reiniciar secuencias autoincrementales
  db.prepare("UPDATE configuracion SET valor = '' WHERE clave = 'ultimo_cierre_caja'").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('ventas', 'venta_detalles', 'cierres_caja')").run();

  if (mode === '--vacio') {
    // Elimina todos los productos para empezar catálogo desde cero
    db.prepare('DELETE FROM productos').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'productos'").run();
    console.log('✅ Ventas y tickets eliminados.');
    console.log('✅ Historial de cierres de caja eliminado.');
    console.log('✅ Caja reiniciada a $0,00.');
    console.log('✅ Catálogo de productos vaciado (listo para cargar stock real).');
  } else if (mode === '--todo') {
    // Restablece productos al catálogo de muestra inicial
    db.prepare('DELETE FROM productos').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'productos'").run();
    
    const insertProduct = db.prepare(`
      INSERT INTO productos (barcode, name, cost_price, sale_price, stock)
      VALUES (?, ?, ?, ?, ?)
    `);

    const seedProducts = [
      { barcode: '9780307474728', name: 'Cien Años de Soledad - G. García Márquez', cost_price: 12000, sale_price: 18500, stock: 15 },
      { barcode: '9789871138012', name: 'El Principito - Antoine de Saint-Exupéry', cost_price: 6500, sale_price: 10500, stock: 24 },
      { barcode: '9788478884452', name: 'Harry Potter y la Piedra Filosofal', cost_price: 14500, sale_price: 22000, stock: 8 },
      { barcode: '9789500732895', name: 'Rayuela - Julio Cortázar', cost_price: 13000, sale_price: 19800, stock: 4 },
      { barcode: '7791234560011', name: 'Cuaderno Universitario A4 Rayado 80h', cost_price: 2100, sale_price: 3600, stock: 45 },
      { barcode: '7791234560028', name: 'Cuaderno Universitario A4 Cuadriculado 80h', cost_price: 2100, sale_price: 3600, stock: 30 },
      { barcode: '7033012965412', name: 'Bolígrafo BIC Cristal Azul 1.0mm', cost_price: 350, sale_price: 750, stock: 120 },
      { barcode: '7033012965429', name: 'Bolígrafo BIC Cristal Negro 1.0mm', cost_price: 350, sale_price: 750, stock: 95 },
      { barcode: '4007817304563', name: 'Resaltador Flúor Faber-Castell Amarillo', cost_price: 850, sale_price: 1600, stock: 3 },
      { barcode: '7798083810145', name: 'Cinta Adhesiva Transparente 18mm x 30m', cost_price: 600, sale_price: 1200, stock: 18 }
    ];

    for (const prod of seedProducts) {
      insertProduct.run(prod.barcode, prod.name, prod.cost_price, prod.sale_price, prod.stock);
    }

    console.log('✅ Ventas y tickets eliminados.');
    console.log('✅ Historial de cierres de caja eliminado.');
    console.log('✅ Caja reiniciada a $0,00.');
    console.log(`✅ Catálogo restablecido con los ${seedProducts.length} productos de demostración.`);
  } else {
    // --ventas (por defecto): mantiene los productos cargados
    console.log('✅ Historial de ventas y tickets eliminados.');
    console.log('✅ Historial de cierres de caja eliminado.');
    console.log('✅ Caja reiniciada a $0,00.');
    console.log('✅ Tus productos y usuarios fueron CONSERVADOS.');
  }
})();

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

console.log('\n✨ Base de datos lista y limpia para iniciar la prueba real!');
