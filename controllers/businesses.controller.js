/**
 * Businesses Controller — Platform Management for Super Admin & Business Admin
 */
const knex = require('../database/knex');
const bcrypt = require('bcryptjs');

exports.getAll = async (req, res) => {
  try {
    const { role, businessId } = req.user;

    let query = knex('businesses as b').select(
      'b.*',
      knex.raw('(SELECT COUNT(*) FROM branches br WHERE br.business_id = b.id AND br.is_active = true) as branches_count'),
      knex.raw('(SELECT COUNT(*) FROM users u WHERE u.business_id = b.id AND u.is_active = true) as users_count')
    );

    if (role !== 'super_admin') {
      query.where('b.id', businessId);
    }

    const businesses = await query.orderBy('b.created_at', 'desc');
    res.json(businesses);
  } catch (err) {
    console.error('Error al obtener lista de negocios:', err);
    res.status(500).json({ error: 'Error al consultar negocios' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, businessId } = req.user;

    if (role !== 'super_admin' && id !== businessId) {
      return res.status(403).json({ error: 'No tienes acceso a este negocio' });
    }

    const business = await knex('businesses').where('id', id).first();
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' });

    const branches = await knex('branches').where({ business_id: id });
    const users = await knex('users')
      .select('id', 'username', 'full_name', 'role', 'is_active', 'branch_id', 'created_at')
      .where({ business_id: id });

    res.json({ ...business, branches, users });
  } catch (err) {
    console.error('Error al obtener detalle del negocio:', err);
    res.status(500).json({ error: 'Error al consultar negocio' });
  }
};

exports.create = async (req, res) => {
  const { name, nit, business_type, plan, max_branches, admin_username, admin_password, admin_name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
  }

  const slug = name.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Math.floor(100 + Math.random() * 900);

  try {
    const result = await knex.transaction(async (trx) => {
      const [business] = await trx('businesses').insert({
        name,
        slug,
        nit: nit || null,
        business_type: business_type || 'restaurant',
        plan: plan || 'pro',
        max_branches: max_branches ? parseInt(max_branches, 10) : 3
      }).returning('*');

      const [branch] = await trx('branches').insert({
        business_id: business.id,
        name: 'Sucursal Principal',
        code: 'MAIN-01',
        address: 'Dirección Principal',
        phone: '',
        timezone: 'America/Bogota'
      }).returning('*');

      const username = admin_username || `admin_${slug.slice(0, 15)}`;
      const rawPassword = admin_password || 'admin123';
      const hash = bcrypt.hashSync(rawPassword, 10);

      const [adminUser] = await trx('users').insert({
        business_id: business.id,
        branch_id: null,
        username,
        password_hash: hash,
        full_name: admin_name || `Admin ${name}`,
        role: 'admin'
      }).returning(['id', 'username', 'full_name', 'role']);

      const defaultCatNames = ['Entradas', 'Platos Fuertes', 'Bebidas', 'Postres'];
      for (let i = 0; i < defaultCatNames.length; i++) {
        await trx('categories').insert({
          business_id: business.id,
          branch_id: null,
          name: defaultCatNames[i],
          sort_order: i + 1
        });
      }

      for (let i = 1; i <= 4; i++) {
        await trx('tables_restaurant').insert({
          business_id: business.id,
          branch_id: branch.id,
          table_number: `Mesa ${i}`,
          capacity: 4
        });
      }

      await trx('settings').insert({
        business_id: business.id,
        branch_id: null,
        business_name: name,
        nit: nit || '',
        receipt_footer: '¡Gracias por su compra!'
      });

      return { business, branch, adminUser, defaultPassword: rawPassword };
    });

    res.status(201).json({
      message: 'Negocio cliente creado y provisionado exitosamente',
      business: result.business,
      branch: result.branch,
      adminUser: result.adminUser,
      defaultPassword: result.defaultPassword
    });
  } catch (err) {
    console.error('Error al crear negocio:', err);
    res.status(500).json({ error: 'Error al provisionar el nuevo negocio cliente' });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, nit, business_type, plan, max_branches, is_active } = req.body;
  const { role, businessId } = req.user;

  if (role !== 'super_admin' && id !== businessId) {
    return res.status(403).json({ error: 'No tienes permisos para modificar este negocio' });
  }

  try {
    const updateData = {};
    if (name) updateData.name = name;
    if (nit !== undefined) updateData.nit = nit;
    if (business_type) updateData.business_type = business_type;
    if (plan && role === 'super_admin') updateData.plan = plan;
    if (max_branches !== undefined && role === 'super_admin') updateData.max_branches = parseInt(max_branches, 10);
    if (is_active !== undefined && role === 'super_admin') updateData.is_active = Boolean(is_active);

    updateData.updated_at = knex.fn.now();

    await knex('businesses').where('id', id).update(updateData);
    res.json({ message: 'Negocio actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar negocio:', err);
    res.status(500).json({ error: 'Error al actualizar negocio' });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  try {
    await knex('businesses').where('id', id).update({ is_active: false, updated_at: knex.fn.now() });
    res.json({ message: 'Negocio desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar negocio:', err);
    res.status(500).json({ error: 'Error al desactivar negocio' });
  }
};

exports.deletePermanent = async (req, res) => {
  const { id } = req.params;
  const { role } = req.user;

  if (role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo el Super Administrador puede eliminar negocios definitivamente' });
  }

  try {
    await knex('businesses').where('id', id).del();
    res.json({ message: 'Negocio y todos sus datos asociados eliminados definitivamente' });
  } catch (err) {
    console.error('Error al eliminar negocio:', err);
    res.status(500).json({ error: 'Error al eliminar el negocio de la base de datos' });
  }
};
