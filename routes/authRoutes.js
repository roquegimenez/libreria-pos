const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET, authenticateToken } = require('../auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Por favor complete el usuario y la contraseña.' });
  }

  try {
    const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username.trim());

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      rol: user.rol
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: payload
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor al autenticar.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/reset-password - Recuperación de contraseña mediante clave maestra
router.post('/reset-password', (req, res) => {
  const { masterKey, username, newPassword } = req.body;

  if (!masterKey || !username || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
  }

  try {
    const masterConfig = db.prepare("SELECT valor FROM configuracion WHERE clave = 'clave_maestra'").get();
    const validMasterKey = masterConfig ? masterConfig.valor : 'TRILLIZAS-RECUPERAR';

    if (masterKey.trim() !== validMasterKey) {
      return res.status(403).json({ error: 'Clave maestra de recuperación incorrecta.' });
    }

    const user = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE username = ?').get(username.trim());
    if (!user) {
      return res.status(404).json({ error: `El usuario "${username}" no existe en el sistema.` });
    }

    const hashed = bcrypt.hashSync(newPassword.trim(), 10);
    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashed, user.id);

    res.json({ message: `Contraseña de "${user.nombre}" restablecida con éxito. Ya puedes iniciar sesión.` });
  } catch (error) {
    console.error('Error restableciendo contraseña:', error);
    res.status(500).json({ error: 'Error al restablecer la contraseña.' });
  }
});

module.exports = router;

