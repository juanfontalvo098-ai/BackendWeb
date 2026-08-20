/**
 * Supply Categories Controller — Multi-tenant
 * CRUD completo de Categorías de Insumos & Materias Primas
 */
const knex = require('../database/knex');

// Obtener todas las categorías de insumos con conteo de insumos vinculados
exports.getAll = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const categories = await knex('supply_categories as sc')
      .leftJoin('supplies as s', function() {
        this.on('sc.id', '=', 's.category_id')
          .andOn('s.is_active', '=', knex.raw('true'));
      })
      .select(
        'sc.*',
        knex.raw('COUNT(s.id)::int as supplies_count')
      )
      .where('sc.business_id', businessId)
      .andWhere('sc.is_active', true)
      .groupBy('sc.id')
      .orderBy('sc.name', 'asc');

    // Asignar identificador correlativo relativo al negocio (#1, #2, #3...)
    const indexed = categories.map((cat, index) => ({
      ...cat,
      business_relative_id: index + 1
    }));

    res.json(indexed);
  } catch (err) {
    console.error('Error al obtener categorías de insumos:', err);
    res.status(500).json({ error: 'Error al consultar categorías de insumos' });
  }
};

// Crear nueva categoría de insumo
exports.create = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { name, description, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
    }

    const existing = await knex('supply_categories')
      .where({ business_id: businessId, name: name.trim() })
      .first();

    if (existing) {
      if (!existing.is_active) {
        // Reactivar
        const [reactivated] = await knex('supply_categories')
          .where({ id: existing.id })
          .update({
            is_active: true,
            description: description || existing.description,
            color: color || existing.color,
            updated_at: knex.fn.now()
          }).returning('*');
        return res.status(201).json(reactivated);
      }
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
    }

    const [newCategory] = await knex('supply_categories').insert({
      business_id: businessId,
      name: name.trim(),
      description: description ? description.trim() : null,
      color: color || '#3b82f6',
      is_active: true
    }).returning('*');

    res.status(201).json(newCategory);
  } catch (err) {
    console.error('Error al crear categoría de insumo:', err);
    res.status(500).json({ error: 'Error al registrar categoría de insumo: ' + err.message });
  }
};

// Actualizar categoría de insumo
exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { name, description, color } = req.body;

    const existing = await knex('supply_categories')
      .where({ id, business_id: businessId })
      .first();

    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

    const updateData = { updated_at: knex.fn.now() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (color !== undefined) updateData.color = color;

    const [updated] = await knex('supply_categories')
      .where({ id, business_id: businessId })
      .update(updateData)
      .returning('*');

    // Sincronizar el nombre en la tabla supplies si cambió el nombre
    if (name && name.trim() !== existing.name) {
      await knex('supplies')
        .where({ business_id: businessId, category_id: id })
        .update({ category: name.trim() });
    }

    res.json(updated);
  } catch (err) {
    console.error('Error al actualizar categoría de insumo:', err);
    res.status(500).json({ error: 'Error al actualizar categoría de insumo' });
  }
};

// Eliminar categoría de insumo
exports.remove = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const existing = await knex('supply_categories')
      .where({ id, business_id: businessId })
      .first();

    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

    // Desvincular insumos que tengan esta categoría
    await knex('supplies')
      .where({ business_id: businessId, category_id: id })
      .update({ category_id: null, category: 'General' });

    // Eliminar categoría
    await knex('supply_categories')
      .where({ id, business_id: businessId })
      .del();

    res.json({ message: 'Categoría eliminada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar categoría de insumo:', err);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
};
