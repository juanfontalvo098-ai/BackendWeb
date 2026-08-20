/**
 * Suppliers Controller — Multi-tenant
 * CRUD de proveedores, catálogo de productos por proveedor
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { search, is_active } = req.query;

    let query = knex('suppliers').where('business_id', businessId);

    if (search) {
      query.andWhere(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('contact_name', 'ilike', `%${search}%`)
          .orWhere('document_number', 'ilike', `%${search}%`);
      });
    }
    if (is_active !== undefined) query.andWhere('is_active', is_active === 'true');

    const suppliers = await query.orderBy('name');
    res.json(suppliers);
  } catch (err) {
    console.error('Error al obtener proveedores:', err);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const supplier = await knex('suppliers')
      .where({ id: req.params.id, business_id: businessId })
      .first();

    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

    // Cargar productos del proveedor
    supplier.products = await knex('supplier_products as sp')
      .join('products as p', 'sp.product_id', 'p.id')
      .select('sp.*', 'p.name as product_name', 'p.price as product_price')
      .where('sp.supplier_id', supplier.id);

    res.json(supplier);
  } catch (err) {
    console.error('Error al obtener proveedor:', err);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
};

exports.create = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { name, contact_name, document_number, email, phone, address, city, payment_terms, notes } = req.body;

    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    const [supplier] = await knex('suppliers').insert({
      business_id: businessId,
      name,
      contact_name: contact_name || null,
      document_number: document_number || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      payment_terms: payment_terms || 'contado',
      notes: notes || null
    }).returning('*');

    res.status(201).json(supplier);
  } catch (err) {
    console.error('Error al crear proveedor:', err);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
};

exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const existing = await knex('suppliers').where({ id, business_id: businessId }).first();
    if (!existing) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const { name, contact_name, document_number, email, phone, address, city, payment_terms, notes, is_active } = req.body;

    const updateData = { updated_at: knex.fn.now() };
    if (name !== undefined) updateData.name = name;
    if (contact_name !== undefined) updateData.contact_name = contact_name || null;
    if (document_number !== undefined) updateData.document_number = document_number || null;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (address !== undefined) updateData.address = address || null;
    if (city !== undefined) updateData.city = city || null;
    if (payment_terms !== undefined) updateData.payment_terms = payment_terms;
    if (notes !== undefined) updateData.notes = notes || null;
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    await knex('suppliers').where({ id, business_id: businessId }).update(updateData);
    res.json({ message: 'Proveedor actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar proveedor:', err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('suppliers')
      .where({ id: req.params.id, business_id: businessId })
      .update({ is_active: false, updated_at: knex.fn.now() });
    res.json({ message: 'Proveedor desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar proveedor:', err);
    res.status(500).json({ error: 'Error al desactivar proveedor' });
  }
};

// --- Catálogo de productos del proveedor ---
exports.addProduct = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { product_id, supplier_sku, cost_price, lead_time_days } = req.body;

    const supplier = await knex('suppliers').where({ id, business_id: businessId }).first();
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const product = await knex('products').where({ id: product_id, business_id: businessId }).first();
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    const [record] = await knex('supplier_products').insert({
      supplier_id: id,
      product_id,
      supplier_sku: supplier_sku || null,
      cost_price: parseFloat(cost_price),
      lead_time_days: lead_time_days || 1
    }).returning('*');

    res.status(201).json(record);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Este producto ya está asociado a este proveedor' });
    }
    console.error('Error al agregar producto al proveedor:', err);
    res.status(500).json({ error: 'Error al agregar producto al proveedor' });
  }
};

exports.removeProduct = async (req, res) => {
  try {
    const { id, productId } = req.params;
    await knex('supplier_products')
      .where({ supplier_id: id, product_id: productId })
      .del();
    res.json({ message: 'Producto removido del proveedor' });
  } catch (err) {
    console.error('Error al remover producto del proveedor:', err);
    res.status(500).json({ error: 'Error al remover producto del proveedor' });
  }
};

exports.getPurchaseHistory = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const orders = await knex('purchase_orders')
      .where({ supplier_id: id, business_id: businessId })
      .orderBy('created_at', 'desc');

    const stats = await knex('purchase_orders')
      .where({ supplier_id: id, business_id: businessId })
      .whereIn('status', ['recibida', 'parcial'])
      .select(
        knex.raw('COUNT(*) as total_orders'),
        knex.raw('COALESCE(SUM(total), 0) as total_purchased'),
        knex.raw('MAX(received_date) as last_delivery')
      ).first();

    res.json({ orders, stats });
  } catch (err) {
    console.error('Error al obtener historial de compras:', err);
    res.status(500).json({ error: 'Error al obtener historial de compras' });
  }
};
