const db = require('../database/connection');
const z = require('zod');

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  sort_order: z.number().int().optional()
});

exports.getAll = (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
  res.json(categories);
};

exports.create = (req, res) => {
  try {
    const data = categorySchema.parse(req.body);
    const info = db.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)')
      .run(data.name, data.description || null, data.sort_order || 0);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Categoría creada' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Error al crear categoría' });
  }
};

exports.update = (req, res) => {
  const { id } = req.params;
  try {
    const data = categorySchema.partial().parse(req.body);
    let query = 'UPDATE categories SET ';
    let values = [];
    let fields = [];
    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }
    if (fields.length === 0) return res.json({ message: 'Sin cambios' });
    
    values.push(id);
    db.prepare(query + fields.join(', ') + ' WHERE id = ?').run(...values);
    res.json({ message: 'Categoría actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
};

exports.remove = (req, res) => {
  db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Categoría eliminada lógicamente' });
};
