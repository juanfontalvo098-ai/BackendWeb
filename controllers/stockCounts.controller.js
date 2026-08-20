/**
 * Stock Counts Controller — Multi-tenant
 * Conteo de inventario físico con reconciliación automática
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('stock_counts as sc')
      .join('users as u', 'sc.user_id', 'u.id')
      .join('branches as b', 'sc.branch_id', 'b.id')
      .select('sc.*', 'u.full_name as user_name', 'b.name as branch_name')
      .where('sc.business_id', businessId);

    if (branchId && !isGlobalScope) query.andWhere('sc.branch_id', branchId);

    const counts = await query.orderBy('sc.started_at', 'desc');
    res.json(counts);
  } catch (err) {
    console.error('Error al obtener conteos:', err);
    res.status(500).json({ error: 'Error al obtener conteos de inventario' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const sc = await knex('stock_counts as sc')
      .join('users as u', 'sc.user_id', 'u.id')
      .select('sc.*', 'u.full_name as user_name')
      .where({ 'sc.id': req.params.id, 'sc.business_id': businessId })
      .first();

    if (!sc) return res.status(404).json({ error: 'Conteo no encontrado' });

    sc.items = await knex('stock_count_items as sci')
      .join('products as p', 'sci.product_id', 'p.id')
      .select('sci.*', 'p.name as product_name', 'p.unit_of_measure')
      .where('sci.stock_count_id', sc.id);

    res.json(sc);
  } catch (err) {
    console.error('Error al obtener conteo:', err);
    res.status(500).json({ error: 'Error al obtener conteo' });
  }
};

// Crear nuevo conteo (carga todos los productos con stock del sistema)
exports.create = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { notes } = req.body;

    const countId = await knex.transaction(async (trx) => {
      const [sc] = await trx('stock_counts').insert({
        business_id: businessId,
        branch_id: branchId,
        user_id: userId,
        notes: notes || null
      }).returning('*');

      // Cargar todos los productos con track_inventory
      const inventoryItems = await trx('inventory as inv')
        .join('products as p', 'inv.product_id', 'p.id')
        .select('inv.product_id', 'inv.quantity')
        .where({ 'inv.branch_id': branchId, 'p.track_inventory': true });

      for (const item of inventoryItems) {
        await trx('stock_count_items').insert({
          stock_count_id: sc.id,
          product_id: item.product_id,
          system_quantity: parseFloat(item.quantity),
          counted_quantity: null,
          difference: null
        });
      }

      return sc.id;
    });

    res.status(201).json({ id: countId, message: 'Conteo de inventario iniciado' });
  } catch (err) {
    console.error('Error al crear conteo:', err);
    res.status(500).json({ error: 'Error al crear conteo de inventario' });
  }
};

// Actualizar cantidad contada de un item
exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { counted_quantity, notes } = req.body;

    const item = await knex('stock_count_items').where('id', itemId).first();
    if (!item) return res.status(404).json({ error: 'Item de conteo no encontrado' });

    const difference = parseFloat(counted_quantity) - parseFloat(item.system_quantity);

    await knex('stock_count_items').where('id', itemId).update({
      counted_quantity: parseFloat(counted_quantity),
      difference,
      notes: notes || null
    });

    res.json({ message: 'Cantidad actualizada', difference });
  } catch (err) {
    console.error('Error al actualizar item:', err);
    res.status(500).json({ error: 'Error al actualizar item de conteo' });
  }
};

// Finalizar conteo: aplica ajustes automáticos al inventario
exports.complete = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { id } = req.params;

    const sc = await knex('stock_counts')
      .where({ id, business_id: businessId, status: 'en_proceso' })
      .first();
    if (!sc) return res.status(404).json({ error: 'Conteo no encontrado o ya completado' });

    await knex.transaction(async (trx) => {
      const items = await trx('stock_count_items')
        .where('stock_count_id', id)
        .whereNotNull('counted_quantity');

      for (const item of items) {
        if (parseFloat(item.difference) === 0) continue;

        // Ajustar inventario
        const inv = await trx('inventory')
          .where({ branch_id: sc.branch_id, product_id: item.product_id })
          .first();

        if (inv) {
          const newQty = parseFloat(item.counted_quantity);
          await trx('inventory').where({ id: inv.id }).update({
            quantity: newQty,
            updated_at: trx.fn.now()
          });

          await trx('inventory_movements').insert({
            business_id: businessId,
            branch_id: sc.branch_id,
            product_id: item.product_id,
            movement_type: 'ajuste',
            quantity: parseFloat(item.difference),
            unit_cost: 0,
            balance_after: newQty,
            reference_type: 'stock_count',
            reference_id: id,
            notes: `Ajuste por conteo físico. Diferencia: ${item.difference}`,
            user_id: userId
          });
        }
      }

      await trx('stock_counts').where('id', id).update({
        status: 'completado',
        completed_at: trx.fn.now()
      });
    });

    res.json({ message: 'Conteo finalizado y ajustes aplicados' });
  } catch (err) {
    console.error('Error al completar conteo:', err);
    res.status(500).json({ error: 'Error al completar conteo' });
  }
};

exports.cancel = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('stock_counts')
      .where({ id: req.params.id, business_id: businessId, status: 'en_proceso' })
      .update({ status: 'cancelado' });
    res.json({ message: 'Conteo cancelado' });
  } catch (err) {
    console.error('Error al cancelar conteo:', err);
    res.status(500).json({ error: 'Error al cancelar conteo' });
  }
};
