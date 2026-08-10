const db = require('../database/connection');
const z = require('zod');

const productSchema = z.object({
  category_id: z.number().int(),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  tax_rate: z.number().optional().default(0.19),
  tax_included: z.number().int().optional().default(1),
  image_url: z.string().optional()
});

exports.getAll = (req, res) => {
  const { category_id, search } = req.query;
  let sql = 'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.is_available = 1';
  let params = [];

  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }
  if (search) {
    sql += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }

  const products = db.prepare(sql).all(...params);
  res.json(products);
};

exports.getById = (req, res) => {
  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(product);
};

exports.create = (req, res) => {
  try {
    const data = productSchema.parse(req.body);
    const info = db.prepare('INSERT INTO products (category_id, name, description, price, tax_rate, tax_included, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(data.category_id, data.name, data.description || null, data.price, data.tax_rate, data.tax_included, data.image_url || null);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Producto creado' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Error al crear producto' });
  }
};

exports.update = (req, res) => {
  try {
    const data = productSchema.partial().parse(req.body);
    let fields = [];
    let values = [];
    for (let key in data) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return res.json({ message: 'Sin cambios' });
    
    fields.push('updated_at = datetime("now")');
    values.push(req.params.id);
    
    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
};

exports.remove = (req, res) => {
  db.prepare('UPDATE products SET is_available = 0, updated_at = datetime("now") WHERE id = ?').run(req.params.id);
  res.json({ message: 'Producto eliminado lógicamente' });
};
