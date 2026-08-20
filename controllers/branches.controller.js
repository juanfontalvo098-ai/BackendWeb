/**
 * Branches Controller — Branch Management per Business
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const businessId = req.tenant?.businessId || req.user?.businessId;
    let query = knex('branches').where('is_active', true);
    if (businessId) {
      query.andWhere('business_id', businessId);
    }
    const branches = await query.orderBy('name');
    res.json(branches);
  } catch (err) {
    console.error('Error al obtener sucursales:', err);
    res.status(500).json({ error: 'Error al consultar sucursales' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const branch = await knex('branches').where('id', id).first();
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json(branch);
  } catch (err) {
    console.error('Error al obtener sucursal:', err);
    res.status(500).json({ error: 'Error al consultar sucursal' });
  }
};

exports.getByBusiness = async (req, res) => {
  const { businessId } = req.params;
  const { role, businessId: userBusinessId } = req.user;

  if (role !== 'super_admin' && businessId !== userBusinessId) {
    return res.status(403).json({ error: 'No tienes acceso a las sucursales de este negocio' });
  }

  try {
    const branches = await knex('branches')
      .where({ business_id: businessId, is_active: true })
      .orderBy('name');
    res.json(branches);
  } catch (err) {
    console.error('Error al obtener sucursales:', err);
    res.status(500).json({ error: 'Error al consultar sucursales' });
  }
};

exports.create = async (req, res) => {
  const { name, code, address, phone, timezone, receipt_footer } = req.body;
  const { businessId: reqBusinessId } = req.params;
  const { role, businessId: userBusinessId } = req.user;

  const targetBusinessId = reqBusinessId || req.tenant?.businessId || userBusinessId;

  if (role !== 'super_admin' && targetBusinessId !== userBusinessId) {
    return res.status(403).json({ error: 'No tienes permisos para agregar sucursales a este negocio' });
  }

  if (!name || !code) {
    return res.status(400).json({ error: 'Nombre y código de sucursal (ej: MDE-02) son requeridos' });
  }

  try {
    const business = await knex('businesses').where('id', targetBusinessId).first();
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' });

    const currentCount = await knex('branches')
      .where({ business_id: targetBusinessId, is_active: true })
      .count('id as count')
      .first();

    if (parseInt(currentCount.count) >= business.max_branches && role !== 'super_admin') {
      return res.status(400).json({
        error: `Has alcanzado el límite de ${business.max_branches} sucursales permitido para tu plan (${business.plan}).`
      });
    }

    const [branch] = await knex('branches').insert({
      business_id: targetBusinessId,
      name,
      code: code.toUpperCase(),
      address: address || null,
      phone: phone || null,
      timezone: timezone || 'America/Bogota',
      receipt_footer: receipt_footer || '¡Gracias por su preferencia!'
    }).returning('*');

    for (let i = 1; i <= 4; i++) {
      await knex('tables_restaurant').insert({
        business_id: targetBusinessId,
        branch_id: branch.id,
        table_number: `Mesa ${i}`,
        capacity: 4
      });
    }

    res.status(201).json({ branch, message: 'Sucursal creada exitosamente' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una sucursal con este código en el negocio' });
    }
    console.error('Error al crear sucursal:', err);
    res.status(500).json({ error: 'Error al crear la sucursal' });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, code, address, phone, timezone, receipt_footer, is_active } = req.body;
  const { role, businessId } = req.user;

  try {
    const branch = await knex('branches').where('id', id).first();
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });

    if (role !== 'super_admin' && branch.business_id !== businessId) {
      return res.status(403).json({ error: 'No tienes permisos para modificar esta sucursal' });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (code) updateData.code = code.toUpperCase();
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (timezone) updateData.timezone = timezone;
    if (receipt_footer !== undefined) updateData.receipt_footer = receipt_footer;
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    updateData.updated_at = knex.fn.now();

    await knex('branches').where('id', id).update(updateData);
    res.json({ message: 'Sucursal actualizada exitosamente' });
  } catch (err) {
    console.error('Error al actualizar sucursal:', err);
    res.status(500).json({ error: 'Error al actualizar sucursal' });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const { role, businessId } = req.user;

  try {
    const branch = await knex('branches').where('id', id).first();
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });

    if (role !== 'super_admin' && branch.business_id !== businessId) {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    await knex('branches').where('id', id).update({ is_active: false, updated_at: knex.fn.now() });
    res.json({ message: 'Sucursal desactivada exitosamente' });
  } catch (err) {
    console.error('Error al desactivar sucursal:', err);
    res.status(500).json({ error: 'Error al desactivar sucursal' });
  }
};

exports.deletePermanent = async (req, res) => {
  const { id } = req.params;
  const { role, businessId: userBusinessId } = req.user;

  try {
    const branch = await knex('branches').where('id', id).first();
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });

    if (role !== 'super_admin' && branch.business_id !== userBusinessId) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar esta sucursal' });
    }

    // Verificar si es la única sucursal del negocio
    const totalBranches = await knex('branches')
      .where({ business_id: branch.business_id })
      .count('id as count')
      .first();

    if (parseInt(totalBranches.count, 10) <= 1 && role !== 'super_admin') {
      return res.status(400).json({ error: 'No puedes eliminar la única sucursal de tu negocio' });
    }

    await knex.transaction(async (trx) => {
      // 1. Delivery y comandas de la sucursal
      const orderIds = (await trx('orders').where('branch_id', id).select('id')).map(o => o.id);
      if (orderIds.length > 0) {
        await trx('delivery_assignments').whereIn('order_id', orderIds).del().catch(() => {});
        await trx('kitchen_tickets').whereIn('order_id', orderIds).del().catch(() => {});
        await trx('order_items').whereIn('order_id', orderIds).del().catch(() => {});
      }

      // 2. Facturas y órdenes
      await trx('credit_notes').where('branch_id', id).del().catch(() => {});
      await trx('debit_notes').where('branch_id', id).del().catch(() => {});
      await trx('accounts_receivable').where('branch_id', id).del().catch(() => {});
      await trx('accounts_payable').where('branch_id', id).del().catch(() => {});
      await trx('invoices').where('branch_id', id).del().catch(() => {});
      await trx('orders').where('branch_id', id).del().catch(() => {});

      // 3. Cajas y turnos
      const crIds = (await trx('cash_registers').where('branch_id', id).select('id')).map(c => c.id);
      if (crIds.length > 0) {
        await trx('cash_movements').whereIn('cash_register_id', crIds).del().catch(() => {});
      }
      await trx('shift_reports').where('branch_id', id).del().catch(() => {});
      await trx('cash_registers').where('branch_id', id).del().catch(() => {});

      // 4. Inventario de la sucursal
      await trx('inventory_movements').where('branch_id', id).del().catch(() => {});
      await trx('inventory').where('branch_id', id).del().catch(() => {});
      await trx('supplies_movements').where('branch_id', id).del().catch(() => {});
      await trx('supplies_inventory').where('branch_id', id).del().catch(() => {});

      // 5. Conteos y compras
      const scIds = (await trx('stock_counts').where('branch_id', id).select('id')).map(s => s.id);
      if (scIds.length > 0) {
        await trx('stock_count_items').whereIn('stock_count_id', scIds).del().catch(() => {});
      }
      await trx('stock_counts').where('branch_id', id).del().catch(() => {});

      const poIds = (await trx('purchase_orders').where('branch_id', id).select('id')).map(p => p.id);
      if (poIds.length > 0) {
        await trx('purchase_order_items').whereIn('purchase_order_id', poIds).del().catch(() => {});
      }
      await trx('purchase_orders').where('branch_id', id).del().catch(() => {});

      // 6. Mesas y configuración de sucursal
      await trx('tables_restaurant').where('branch_id', id).del().catch(() => {});
      await trx('settings').where('branch_id', id).del().catch(() => {});
      await trx('attendance').where('branch_id', id).del().catch(() => {});
      await trx('shifts_schedule').where('branch_id', id).del().catch(() => {});

      // 7. Reasignar usuarios y empleados de esa sucursal a branch_id = null
      await trx('users').where('branch_id', id).update({ branch_id: null }).catch(() => {});
      await trx('employees').where('branch_id', id).update({ branch_id: null }).catch(() => {});

      // 8. Eliminar sucursal
      await trx('branches').where('id', id).del();
    });

    res.json({ message: `Sucursal "${branch.name}" eliminada definitivamente` });
  } catch (err) {
    console.error('Error al eliminar sucursal:', err);
    res.status(500).json({ error: 'Error al eliminar sucursal: ' + (err.message || 'Error de base de datos') });
  }
};
