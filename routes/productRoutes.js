const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../auth');

// Todas las rutas de productos requieren autenticación
router.use(authenticateToken);

// GET /api/products - Listar productos (con búsqueda opcional)
// Oculta cost_price si el usuario es 'empleado'
router.get('/', (req, res) => {
  const { search } = req.query;
  const isAdmin = req.user.rol === 'admin';

  try {
    let query = `
      SELECT 
        id, 
        barcode, 
        name, 
        ${isAdmin ? 'cost_price,' : ''} 
        sale_price, 
        stock, 
        created_at, 
        updated_at
      FROM productos
    `;
    const params = [];

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      query += ` WHERE barcode LIKE ? OR name LIKE ?`;
      params.push(term, term);
    }

    query += ` ORDER BY name ASC`;

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al consultar productos.' });
  }
});

// GET /api/products/barcode/:barcode - Búsqueda rápida por código de barras exacto (para POS)
router.get('/barcode/:barcode', (req, res) => {
  const { barcode } = req.params;
  const isAdmin = req.user.rol === 'admin';

  try {
    const query = `
      SELECT 
        id, 
        barcode, 
        name, 
        ${isAdmin ? 'cost_price,' : ''} 
        sale_price, 
        stock
      FROM productos
      WHERE barcode = ?
    `;
    const product = db.prepare(query).get(barcode.trim());

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado con ese código de barras.' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error buscando por código de barras:', error);
    res.status(500).json({ error: 'Error al buscar el producto.' });
  }
});

// GET /api/products/low-stock - Alerta de stock bajo (Solo Admin)
router.get('/low-stock', requireAdmin, (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 5;
    const products = db.prepare(`
      SELECT id, barcode, name, cost_price, sale_price, stock
      FROM productos
      WHERE stock <= ?
      ORDER BY stock ASC
    `).all(threshold);

    res.json({
      threshold,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('Error consultando stock bajo:', error);
    res.status(500).json({ error: 'Error al consultar alertas de stock.' });
  }
});

// POST /api/products - Crear nuevo producto (Solo Admin)
router.post('/', requireAdmin, (req, res) => {
  const { barcode, name, cost_price, sale_price, stock } = req.body;

  if (!barcode || !name || cost_price === undefined || sale_price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Todos los campos son requeridos: barcode, name, cost_price, sale_price, stock.' });
  }

  const cost = parseFloat(cost_price);
  const sale = parseFloat(sale_price);
  const currentStock = parseInt(stock);

  if (isNaN(cost) || cost < 0 || isNaN(sale) || sale < 0 || isNaN(currentStock) || currentStock < 0) {
    return res.status(400).json({ error: 'Los valores numéricos deben ser válidos y mayores o iguales a cero.' });
  }

  try {
    const existing = db.prepare('SELECT id FROM productos WHERE barcode = ?').get(barcode.trim());
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un producto registrado con ese código de barras.' });
    }

    const stmt = db.prepare(`
      INSERT INTO productos (barcode, name, cost_price, sale_price, stock)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(barcode.trim(), name.trim(), cost, sale, currentStock);

    const newProduct = db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error interno al guardar el producto.' });
  }
});

// PUT /api/products/:id - Editar producto (Solo Admin)
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { barcode, name, cost_price, sale_price, stock } = req.body;

  if (!barcode || !name || cost_price === undefined || sale_price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  const cost = parseFloat(cost_price);
  const sale = parseFloat(sale_price);
  const currentStock = parseInt(stock);

  if (isNaN(cost) || cost < 0 || isNaN(sale) || sale < 0 || isNaN(currentStock) || currentStock < 0) {
    return res.status(400).json({ error: 'Los valores numéricos deben ser válidos.' });
  }

  try {
    const product = db.prepare('SELECT id FROM productos WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    // Verificar si el código de barras está en uso por otro producto
    const duplicate = db.prepare('SELECT id FROM productos WHERE barcode = ? AND id != ?').get(barcode.trim(), id);
    if (duplicate) {
      return res.status(409).json({ error: 'El código de barras ya pertenece a otro producto.' });
    }

    const stmt = db.prepare(`
      UPDATE productos 
      SET barcode = ?, name = ?, cost_price = ?, sale_price = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(barcode.trim(), name.trim(), cost, sale, currentStock, id);

    const updated = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error interno al actualizar el producto.' });
  }
});

// DELETE /api/products/:id - Eliminar producto (Solo Admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  try {
    const product = db.prepare('SELECT id FROM productos WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
    res.json({ message: 'Producto eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

module.exports = router;
