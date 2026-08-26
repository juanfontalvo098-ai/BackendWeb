/**
 * Tables Controller — Multi-tenant
 * Mesas siempre pertenecen a una sucursal específica (branch_id NOT NULL)
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('tables_restaurant').where('business_id', businessId);
    if (branchId && !isGlobalScope) {
      query.andWhere('branch_id', branchId);
    }

    const tables = await query.orderBy('table_number');

    // Enriquecer cada mesa con su orden activa
    for (const table of tables) {
      const order = await knex('orders')
        .where('table_id', table.id)
        .whereIn('status', ['abierta', 'en_preparacion', 'lista'])
        .orderBy('id', 'desc')
        .first();

      if (order) {
        const itemsCount = await knex('order_items')
          .where('order_id', order.id)
          .count('id as count')
          .first();

        if (parseInt(itemsCount.count) === 0 && order.status === 'abierta') {
          table.status = 'libre';
          table.current_order = null;
        } else {
          table.current_order = order;
        }
      } else {
        table.status = 'libre';
        table.current_order = null;
      }
    }

    res.json(tables);
  } catch (err) {
    console.error('Error al obtener mesas:', err);
    res.status(500).json({ error: 'Error al obtener mesas' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const table = await knex('tables_restaurant')
      .where({ id: req.params.id, business_id: businessId })
      .first();

    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(table);
  } catch (err) {
    console.error('Error al obtener mesa:', err);
    res.status(500).json({ error: 'Error al obtener mesa' });
  }
};

exports.create = async (req, res) => {
  const { table_number, capacity, zone } = req.body;
  const { businessId, branchId } = req.tenant;

  if (!table_number) return res.status(400).json({ error: 'El nombre/número de mesa es requerido' });
  if (!branchId) return res.status(400).json({ error: 'Se requiere una sucursal activa para crear mesas' });

  try {
    const [table] = await knex('tables_restaurant').insert({
      business_id: businessId,
      branch_id: branchId,
      table_number,
      capacity: capacity || 4,
      zone: zone || 'interior',
      status: 'libre'
    }).returning('*');

    if (req.app.locals.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
        table_id: table.id, status: 'libre'
      });
    }

    res.status(201).json({ id: table.id, message: 'Mesa creada exitosamente' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una mesa con este nombre/número en esta sucursal' });
    }
    console.error('Error al crear mesa:', err);
    res.status(500).json({ error: 'Error al crear la mesa' });
  }
};

exports.updateTable = async (req, res) => {
  const { table_number, capacity, zone, status } = req.body;
  const { id } = req.params;
  const { businessId, branchId } = req.tenant;

  try {
    await knex('tables_restaurant')
      .where({ id, business_id: businessId })
      .update({
        table_number,
        capacity: capacity || 4,
        zone: zone || 'interior',
        status: status || 'libre'
      });

    if (req.app.locals.io && branchId) {
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
        table_id: id, status: status || 'libre'
      });
    }
    res.json({ message: 'Mesa actualizada exitosamente' });
  } catch (err) {
    console.error('Error al actualizar mesa:', err);
    res.status(500).json({ error: 'Error al actualizar la mesa' });
  }
};

exports.deleteTable = async (req, res) => {
  const { id } = req.params;
  const { businessId, branchId } = req.tenant;

  try {
    const table = await knex('tables_restaurant')
      .where({ id, business_id: businessId })
      .first();

    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (table.status !== 'libre') {
      return res.status(400).json({ error: 'No se puede eliminar una mesa ocupada o pendiente de pago' });
    }

    await knex('tables_restaurant').where({ id, business_id: businessId }).del();

    if (req.app.locals.io && branchId) {
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
        table_id: id, status: 'deleted'
      });
    }
    res.json({ message: 'Mesa eliminada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar mesa:', err);
    res.status(500).json({ error: 'Error al eliminar la mesa' });
  }
};

exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const { businessId, branchId } = req.tenant;

  if (!['libre', 'ocupada', 'pendiente_pago'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    await knex('tables_restaurant')
      .where({ id: req.params.id, business_id: businessId })
      .update({ status });

    if (req.app.locals.io && branchId) {
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
        table_id: req.params.id, status
      });
    }

    res.json({ message: 'Estado de mesa actualizado' });
  } catch (err) {
    console.error('Error al actualizar estado de mesa:', err);
    res.status(500).json({ error: 'Error al actualizar estado de mesa' });
  }
};
