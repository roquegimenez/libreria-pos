const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'libreria_secreto_super_seguro_pos_2026';

// Middleware para verificar que el usuario esté autenticado
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado: Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado. Por favor inicie sesión nuevamente.' });
    }
    req.user = user;
    next();
  });
}

// Middleware para restringir acceso exclusivo a Administradores
function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido: Se requieren permisos de Administrador.' });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  requireAdmin
};
