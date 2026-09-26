const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'libreria.db');
const db = new Database(dbPath);

const arg1 = process.argv[2];
const arg2 = process.argv[3];

console.log('========================================================');
console.log('🔑 RECUPERACIÓN DE ACCESO - Librería Las Trillizas');
console.log('========================================================\n');

function resetUserPassword(username, newPass) {
  const user = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE username = ?').get(username);
  if (!user) {
    console.error(`❌ Error: El usuario "${username}" no existe en la base de datos.`);
    return false;
  }
  const hashed = bcrypt.hashSync(newPass, 10);
  db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashed, user.id);
  console.log(`✅ Contraseña restablecida con éxito para:`);
  console.log(`   - Usuario:    ${username} (${user.nombre})`);
  console.log(`   - Nueva Clave: ${newPass}`);
  return true;
}

if (arg1 === '--admin') {
  const pass = arg2 || 'admin123';
  resetUserPassword('admin', pass);
} else if (arg1 === '--cajero') {
  const pass = arg2 || 'cajero123';
  resetUserPassword('cajero', pass);
} else if (arg1 === '--todo') {
  resetUserPassword('admin', 'admin123');
  console.log('');
  resetUserPassword('cajero', 'cajero123');
} else if (arg1 === '--ver-clave-maestra') {
  const row = db.prepare("SELECT valor FROM configuracion WHERE clave = 'clave_maestra'").get();
  console.log(`ℹ️ Clave Maestra de Recuperación Web actual: ${row ? row.valor : 'TRILLIZAS-RECUPERAR'}`);
} else if (arg1 && arg2) {
  // node recuperar_acceso.js <username> <nueva_clave>
  resetUserPassword(arg1, arg2);
} else {
  // Por defecto si se ejecuta sin argumentos: restablecer ambos a fábrica
  console.log('Restableciendo credenciales por defecto...');
  resetUserPassword('admin', 'admin123');
  console.log('');
  resetUserPassword('cajero', 'cajero123');
}

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

console.log('\n========================================================');
console.log('✨ Ya puedes iniciar sesión con las nuevas credenciales.');
console.log('========================================================');
