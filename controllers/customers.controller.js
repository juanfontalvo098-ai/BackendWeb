/**
 * Customers Controller — Multi-tenant CRM
 * CRUD de clientes, búsqueda, historial de compras, gestión de crédito
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { search, customer_type, is_active } = req.query;

    let query = knex('customers')
      .where('business_id', businessId)
      .select('*');

    if (search) {
      query.andWhere(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('document_number', 'ilike', `%${search}%`)
          .orWhere('phone', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
      });
    }
    if (customer_type) query.andWhere('customer_type', customer_type);
    if (is_active !== undefined) query.andWhere('is_active', is_active === 'true');

    const customers = await query.orderBy('name');
    res.json(customers);
  } catch (err) {
    console.error('Error al obtener clientes:', err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const customer = await knex('customers')
      .where({ id: req.params.id, business_id: businessId })
      .first();

    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(customer);
  } catch (err) {
    console.error('Error al obtener cliente:', err);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

exports.create = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { name, document_type, document_number, email, phone, address, city, notes, customer_type, credit_limit } = req.body;

    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    const [customer] = await knex('customers').insert({
      business_id: businessId,
      name,
      document_type: document_type || 'CC',
      document_number: document_number || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      notes: notes || null,
      customer_type: customer_type || 'regular',
      credit_limit: credit_limit || 0
    }).returning('*');

    res.status(201).json(customer);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un cliente con ese número de documento' });
    }
    console.error('Error al crear cliente:', err);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
};

exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const existing = await knex('customers').where({ id, business_id: businessId }).first();
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

    const { name, document_type, document_number, email, phone, address, city, notes, customer_type, credit_limit, is_active } = req.body;

    const updateData = { updated_at: knex.fn.now() };
    if (name !== undefined) updateData.name = name;
    if (document_type !== undefined) updateData.document_type = document_type;
    if (document_number !== undefined) updateData.document_number = document_number || null;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (address !== undefined) updateData.address = address || null;
    if (city !== undefined) updateData.city = city || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (customer_type !== undefined) updateData.customer_type = customer_type;
    if (credit_limit !== undefined) updateData.credit_limit = parseFloat(credit_limit);
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    await knex('customers').where({ id, business_id: businessId }).update(updateData);
    res.json({ message: 'Cliente actualizado exitosamente' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un cliente con ese número de documento' });
    }
    console.error('Error al actualizar cliente:', err);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('customers')
      .where({ id: req.params.id, business_id: businessId })
      .update({ is_active: false, updated_at: knex.fn.now() });
    res.json({ message: 'Cliente desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar cliente:', err);
    res.status(500).json({ error: 'Error al desactivar cliente' });
  }
};

exports.getPurchaseHistory = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    let query = knex('invoices as i')
      .join('orders as o', 'i.order_id', 'o.id')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .select('i.id', 'i.invoice_number', 'i.total', 'i.subtotal', 'i.tax_total',
        'i.tip_amount', 'i.payment_method', 'i.created_at', 't.table_number',
        'i.discount_amount')
      .where('i.customer_id', id)
      .andWhere('i.business_id', businessId);

    if (startDate && endDate) {
      query.whereRaw('DATE(i.created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const history = await query.orderBy('i.created_at', 'desc');

    const stats = await knex('invoices')
      .where({ customer_id: id, business_id: businessId })
      .select(
        knex.raw('COUNT(*) as total_purchases'),
        knex.raw('COALESCE(SUM(total), 0) as total_spent'),
        knex.raw('COALESCE(AVG(total), 0) as avg_ticket'),
        knex.raw('MAX(created_at) as last_purchase')
      ).first();

    res.json({ purchases: history, stats });
  } catch (err) {
    console.error('Error al obtener historial de compras:', err);
    res.status(500).json({ error: 'Error al obtener historial de compras' });
  }
};

exports.adjustCredit = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { amount, operation } = req.body; // operation: 'add' or 'subtract'

    const customer = await knex('customers').where({ id, business_id: businessId }).first();
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    let newBalance = parseFloat(customer.credit_balance);
    if (operation === 'add') {
      newBalance += parseFloat(amount);
    } else {
      newBalance -= parseFloat(amount);
    }

    if (newBalance > parseFloat(customer.credit_limit) && parseFloat(customer.credit_limit) > 0) {
      return res.status(400).json({ error: 'El ajuste excede el límite de crédito del cliente' });
    }

    await knex('customers').where({ id, business_id: businessId }).update({
      credit_balance: Math.max(0, newBalance),
      updated_at: knex.fn.now()
    });

    res.json({ message: 'Crédito actualizado', new_balance: Math.max(0, newBalance) });
  } catch (err) {
    console.error('Error al ajustar crédito:', err);
    res.status(500).json({ error: 'Error al ajustar crédito' });
  }
};

exports.adjustLoyaltyPoints = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { points, operation } = req.body;

    const customer = await knex('customers').where({ id, business_id: businessId }).first();
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    let newPoints = parseInt(customer.loyalty_points);
    if (operation === 'add') {
      newPoints += parseInt(points);
    } else {
      newPoints = Math.max(0, newPoints - parseInt(points));
    }

    await knex('customers').where({ id, business_id: businessId }).update({
      loyalty_points: newPoints,
      updated_at: knex.fn.now()
    });

    res.json({ message: 'Puntos actualizados', new_points: newPoints });
  } catch (err) {
    console.error('Error al ajustar puntos:', err);
    res.status(500).json({ error: 'Error al ajustar puntos' });
  }
};
