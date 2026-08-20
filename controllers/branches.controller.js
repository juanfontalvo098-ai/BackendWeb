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
  const { role } = req.user;

  if (role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo el Super Administrador puede eliminar sucursales definitivamente' });
  }

  try {
    await knex('branches').where('id', id).del();
    res.json({ message: 'Sucursal eliminada definitivamente' });
  } catch (err) {
    console.error('Error al eliminar sucursal:', err);
    res.status(500).json({ error: 'Error al eliminar sucursal de la base de datos' });
  }
};
