const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../auth');

router.use(authenticateToken);

// GET /api/settings - Obtener configuración del punto de venta (Nombre, subtítulo, pie de ticket)
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
    const config = {};
    rows.forEach(r => {
      config[r.clave] = r.valor;
    });

    res.json(config);
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al consultar configuración.' });
  }
});

// PUT /api/settings - Modificar configuración del punto de venta (Solo Admin)
router.put('/', requireAdmin, (req, res) => {
  const { pos_nombre, pos_subtitulo, pos_ticket_pie } = req.body;

  if (!pos_nombre || pos_nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre del punto de venta es requerido.' });
  }

  try {
    const updateStmt = db.prepare(`
      INSERT INTO configuracion (clave, valor)
      VALUES (?, ?)
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
    `);

    const updateTx = db.transaction(() => {
      updateStmt.run('pos_nombre', pos_nombre.trim());
      if (pos_subtitulo !== undefined) updateStmt.run('pos_subtitulo', pos_subtitulo.trim());
      if (pos_ticket_pie !== undefined) updateStmt.run('pos_ticket_pie', pos_ticket_pie.trim());
    });

    updateTx();

    res.json({ message: 'Configuración actualizada con éxito.' });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error al guardar la configuración.' });
  }
});

// GET /api/settings/users - Listar usuarios para gestión de credenciales (Solo Admin)
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, nombre, rol, created_at FROM usuarios ORDER BY id ASC').all();
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// PUT /api/settings/users/:id - Modificar credenciales de un usuario (Admin o Empleado)
router.put('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, nombre, password } = req.body;

  if (!username || !nombre) {
    return res.status(400).json({ error: 'Usuario y nombre son requeridos.' });
  }

  try {
    const existing = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Comprobar que el nuevo username no colisione con otro
    const duplicate = db.prepare('SELECT id FROM usuarios WHERE username = ? AND id != ?').get(username.trim(), id);
    if (duplicate) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso por otra cuenta.' });
    }

    if (password && password.trim().length > 0) {
      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      }
      const hashed = bcrypt.hashSync(password.trim(), 10);
      db.prepare(`
        UPDATE usuarios 
        SET username = ?, nombre = ?, password = ?
        WHERE id = ?
      `).run(username.trim(), nombre.trim(), hashed, id);
    } else {
      // Mantener la contraseña actual
      db.prepare(`
        UPDATE usuarios 
        SET username = ?, nombre = ?
        WHERE id = ?
      `).run(username.trim(), nombre.trim(), id);
    }

    res.json({ message: `Credenciales de "${nombre}" actualizadas exitosamente.` });
  } catch (error) {
    console.error('Error actualizando credenciales:', error);
    res.status(500).json({ error: 'Error al actualizar las credenciales.' });
  }
});

module.exports = router;
