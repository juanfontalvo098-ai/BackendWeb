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
    const business = await knex('businesses').where('id', id).first();
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    await knex.transaction(async (trx) => {
      // 1. Delivery assignments, tickets de cocina y líneas de orden
      const orderIds = (await trx('orders').where('business_id', id).select('id')).map(o => o.id);
      if (orderIds.length > 0) {
        await trx('delivery_assignments').whereIn('order_id', orderIds).del();
        await trx('kitchen_tickets').whereIn('order_id', orderIds).del();
        await trx('order_items').whereIn('order_id', orderIds).del();
      }

      // 2. Facturas y cartera
      await trx('credit_notes').where('business_id', id).del();
      await trx('debit_notes').where('business_id', id).del();
      await trx('accounts_receivable').where('business_id', id).del();
      await trx('accounts_payable').where('business_id', id).del();
      await trx('invoices').where('business_id', id).del();
      await trx('orders').where('business_id', id).del();

      // 3. Cajas y turnos
      const crIds = (await trx('cash_registers').where('business_id', id).select('id')).map(c => c.id);
      if (crIds.length > 0) {
        await trx('cash_movements').whereIn('cash_register_id', crIds).del();
      }
      await trx('shift_reports').where('business_id', id).del();
      await trx('cash_registers').where('business_id', id).del();

      // 4. Contabilidad
      const jeIds = (await trx('journal_entries').where('business_id', id).select('id')).map(j => j.id);
      if (jeIds.length > 0) {
        await trx('journal_entry_lines').whereIn('journal_entry_id', jeIds).del();
      }
      await trx('journal_entries').where('business_id', id).del();
      await trx('chart_of_accounts').where('business_id', id).del();

      // 5. Inventario, Insumos y Recetas
      const recipeIds = (await trx('recipes').where('business_id', id).select('id')).map(r => r.id);
      if (recipeIds.length > 0) {
        await trx('recipe_items').whereIn('recipe_id', recipeIds).del();
      }
      await trx('recipes').where('business_id', id).del();
      await trx('inventory_movements').where('business_id', id).del();
      await trx('inventory').where('business_id', id).del();
      await trx('supplies_movements').where('business_id', id).del();
      await trx('supplies_inventory').where('business_id', id).del();

      // 6. Conteos y Órdenes de Compra
      const scIds = (await trx('stock_counts').where('business_id', id).select('id')).map(s => s.id);
      if (scIds.length > 0) {
        await trx('stock_count_items').whereIn('stock_count_id', scIds).del();
      }
      await trx('stock_counts').where('business_id', id).del();

      const poIds = (await trx('purchase_orders').where('business_id', id).select('id')).map(p => p.id);
      if (poIds.length > 0) {
        await trx('purchase_order_items').whereIn('purchase_order_id', poIds).del();
      }
      await trx('purchase_orders').where('business_id', id).del();

      // 7. Proveedores, Insumos y Categorías
      const suppIds = (await trx('suppliers').where('business_id', id).select('id')).map(s => s.id);
      if (suppIds.length > 0) {
        await trx('supplier_products').whereIn('supplier_id', suppIds).del();
      }
      await trx('supplies').where('business_id', id).del();
      await trx('supply_categories').where('business_id', id).del();
      await trx('suppliers').where('business_id', id).del();
      await trx('customers').where('business_id', id).del();

      // 8. Descuentos y Listas de Precios
      const discIds = (await trx('discounts').where('business_id', id).select('id')).map(d => d.id);
      if (discIds.length > 0) {
        await trx('coupons').whereIn('discount_id', discIds).del();
      }
      await trx('discounts').where('business_id', id).del();
      
      const plIds = (await trx('price_lists').where('business_id', id).select('id')).map(p => p.id);
      if (plIds.length > 0) {
        await trx('price_list_items').whereIn('price_list_id', plIds).del();
      }
      await trx('price_lists').where('business_id', id).del();

      // 9. Productos y Categorías
      await trx('products').where('business_id', id).del();
      await trx('categories').where('business_id', id).del();

      // 10. RRHH y Empleados
      await trx('attendance').where('business_id', id).del();
      await trx('leave_requests').where('business_id', id).del();
      await trx('shifts_schedule').where('business_id', id).del();
      await trx('payroll').where('business_id', id).del();
      await trx('employees').where('business_id', id).del();

      // 11. Restaurante y Configuración
      await trx('tables_restaurant').where('business_id', id).del();
      await trx('delivery_zones').where('business_id', id).del();
      await trx('invoice_sequences').where('business_id', id).del();
      await trx('settings').where('business_id', id).del();

      // 12. Usuarios, Sucursales y Negocio
      await trx('users').where('business_id', id).del();
      await trx('branches').where('business_id', id).del();
      await trx('businesses').where('id', id).del();
    });

    res.json({ message: `El negocio "${business.name}" y todos sus datos asociados fueron eliminados definitivamente` });
  } catch (err) {
    console.error('Error al eliminar negocio:', err);
    res.status(500).json({ error: 'Error al eliminar el negocio: ' + (err.message || 'Error de base de datos') });
  }
};
