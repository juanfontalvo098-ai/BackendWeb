/**
 * Categories Controller — Multi-tenant
 * Categorías filtradas por business_id, con soporte para categorías globales (branch_id = NULL)
 */
const knex = require('../database/knex');
const z = require('zod');
const { addTenantFilter } = require('../middleware/tenant');

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  sort_order: z.union([z.number(), z.string()]).optional().transform(v => v !== undefined && v !== null ? parseInt(v, 10) : 0)
});

exports.getAll = async (req, res) => {
  try {
    let query = knex('categories').where('is_active', true);
    addTenantFilter(query, req.tenant, { allowGlobalBranch: true });
    const categories = await query.orderBy('sort_order');
    res.json(categories);
  } catch (err) {
    console.error('Error al obtener categorías:', err);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = categorySchema.parse(req.body);
    const { businessId } = req.tenant;

    const [category] = await knex('categories').insert({
      business_id: businessId,
      branch_id: req.body.branch_id || null,
      name: data.name,
      description: data.description || null,
      sort_order: data.sort_order || 0
    }).returning('*');

    res.status(201).json({ id: category.id, message: 'Categoría creada' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Error al crear categoría:', err);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    const data = categorySchema.partial().parse(req.body);
    const updateData = {};

    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;

    if (Object.keys(updateData).length === 0) {
      return res.json({ message: 'Sin cambios' });
    }

    await knex('categories')
      .where({ id, business_id: businessId })
      .update(updateData);

    res.json({ message: 'Categoría actualizada' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
};

exports.remove = async (req, res) => {
  const { businessId } = req.tenant;
  try {
    await knex('categories')
      .where({ id: req.params.id, business_id: businessId })
      .update({ is_active: false });
    res.json({ message: 'Categoría eliminada lógicamente' });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
};
