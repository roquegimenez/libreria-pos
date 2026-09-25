const express = require('express');
const path = require('path');

// Asegurar que la base de datos se inicialice
require('./database');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const saleRoutes = require('./routes/saleRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingRoutes = require('./routes/settingRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);

// Ruta por defecto: servir el login para cualquier ruta no capturada
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint de API no encontrado.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.stack);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

app.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 Sistema POS "Libreria Las Trillizas" - Libreria funcionando!`);
  console.log(`📍 Accede en tu navegador a: http://localhost:${PORT}`);
  console.log('========================================================');
  console.log('👤 Usuarios predeterminados:');
  console.log('   - Administrador: admin  / contraseña: admin123');
  console.log('   - Empleado:      cajero / contraseña: cajero123');
  console.log('========================================================');
});
