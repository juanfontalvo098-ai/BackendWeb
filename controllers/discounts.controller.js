/**
 * Discounts Controller — Multi-tenant
 * CRUD de descuentos, cupones, listas de precios
 */
const knex = require('../database/knex');

// --- Descuentos ---
exports.getAllDiscounts = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { applies_to, is_active } = req.query;

    let query = knex('discounts').where('business_id', businessId);
    if (applies_to) query.andWhere('applies_to', applies_to);
    if (is_active !== undefined) query.andWhere('is_active', is_active === 'true');

    const discounts = await query.orderBy('name');
    res.json(discounts);
  } catch (err) {
    console.error('Error al obtener descuentos:', err);
    res.status(500).json({ error: 'Error al obtener descuentos' });
  }
};

exports.createDiscount = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const data = req.body;

    if (!data.name || !data.discount_type || data.value === undefined) {
      return res.status(400).json({ error: 'Nombre, tipo y valor son requeridos' });
    }

    const [discount] = await knex('discounts').insert({
      business_id: businessId,
      branch_id: data.branch_id || null,
      name: data.name,
      description: data.description || null,
      discount_type: data.discount_type,
      value: parseFloat(data.value),
      applies_to: data.applies_to || 'order',
      target_id: data.target_id || null,
      min_purchase: data.min_purchase || 0,
      max_discount: data.max_discount || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      days_of_week: data.days_of_week ? JSON.stringify(data.days_of_week) : null,
      is_active: data.is_active !== undefined ? data.is_active : true
    }).returning('*');

    res.status(201).json(discount);
  } catch (err) {
    console.error('Error al crear descuento:', err);
    res.status(500).json({ error: 'Error al crear descuento' });
  }
};

exports.updateDiscount = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const data = req.body;

    const existing = await knex('discounts').where({ id, business_id: businessId }).first();
    if (!existing) return res.status(404).json({ error: 'Descuento no encontrado' });

    const updateData = {};
    const fields = ['name', 'description', 'discount_type', 'value', 'applies_to', 'target_id',
      'min_purchase', 'max_discount', 'start_date', 'end_date', 'start_time', 'end_time', 'is_active', 'branch_id'];

    fields.forEach(f => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });
    if (data.days_of_week !== undefined) updateData.days_of_week = JSON.stringify(data.days_of_week);
    if (data.value !== undefined) updateData.value = parseFloat(data.value);

    await knex('discounts').where({ id }).update(updateData);
    res.json({ message: 'Descuento actualizado' });
  } catch (err) {
    console.error('Error al actualizar descuento:', err);
    res.status(500).json({ error: 'Error al actualizar descuento' });
  }
};

exports.removeDiscount = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('discounts').where({ id: req.params.id, business_id: businessId }).update({ is_active: false });
    res.json({ message: 'Descuento desactivado' });
  } catch (err) {
    console.error('Error al desactivar descuento:', err);
    res.status(500).json({ error: 'Error al desactivar descuento' });
  }
};

// Obtener descuentos aplicables ahora (para usar en OrderPage)
exports.getApplicableDiscounts = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const dayOfWeek = now.getDay(); // 0=Sunday

    let query = knex('discounts')
      .where('business_id', businessId)
      .andWhere('is_active', true)
      .andWhere(function() {
        this.whereNull('branch_id').orWhere('branch_id', branchId);
      })
      .andWhere(function() {
        this.whereNull('start_date').orWhere('start_date', '<=', now);
      })
      .andWhere(function() {
        this.whereNull('end_date').orWhere('end_date', '>=', now);
      });

    const discounts = await query.orderBy('name');

    // Filtrar por hora y día si aplica (happy hour)
    const filtered = discounts.filter(d => {
      if (d.start_time && d.end_time) {
        if (currentTime < d.start_time || currentTime > d.end_time) return false;
      }
      if (d.days_of_week) {
        const days = typeof d.days_of_week === 'string' ? JSON.parse(d.days_of_week) : d.days_of_week;
        if (Array.isArray(days) && !days.includes(dayOfWeek)) return false;
      }
      return true;
    });

    res.json(filtered);
  } catch (err) {
    console.error('Error al obtener descuentos aplicables:', err);
    res.status(500).json({ error: 'Error al obtener descuentos' });
  }
};

// --- Cupones ---
exports.getAllCoupons = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const coupons = await knex('coupons as c')
      .join('discounts as d', 'c.discount_id', 'd.id')
      .select('c.*', 'd.name as discount_name', 'd.discount_type', 'd.value')
      .where('c.business_id', businessId)
      .orderBy('c.created_at', 'desc');
    res.json(coupons);
  } catch (err) {
    console.error('Error al obtener cupones:', err);
    res.status(500).json({ error: 'Error al obtener cupones' });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { code, discount_id, max_uses, valid_from, valid_until } = req.body;

    if (!code || !discount_id || !valid_from || !valid_until) {
      return res.status(400).json({ error: 'Código, descuento y fechas son requeridos' });
    }

    const [coupon] = await knex('coupons').insert({
      business_id: businessId,
      code: code.toUpperCase(),
      discount_id,
      max_uses: max_uses || null,
      valid_from,
      valid_until
    }).returning('*');

    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un cupón con ese código' });
    }
    console.error('Error al crear cupón:', err);
    res.status(500).json({ error: 'Error al crear cupón' });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { code } = req.body;

    const coupon = await knex('coupons as c')
      .join('discounts as d', 'c.discount_id', 'd.id')
      .select('c.*', 'd.name as discount_name', 'd.discount_type', 'd.value', 'd.applies_to', 'd.target_id', 'd.min_purchase', 'd.max_discount')
      .where({ 'c.business_id': businessId, 'c.code': code.toUpperCase(), 'c.is_active': true })
      .first();

    if (!coupon) return res.status(404).json({ error: 'Cupón no encontrado o inactivo' });

    const now = new Date();
    if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_until)) {
      return res.status(400).json({ error: 'Cupón fuera de vigencia' });
    }
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'Cupón agotado' });
    }

    res.json({ valid: true, coupon });
  } catch (err) {
    console.error('Error al validar cupón:', err);
    res.status(500).json({ error: 'Error al validar cupón' });
  }
};

exports.redeemCoupon = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { code } = req.body;

    await knex('coupons')
      .where({ business_id: businessId, code: code.toUpperCase() })
      .increment('used_count', 1);

    res.json({ message: 'Cupón redimido' });
  } catch (err) {
    console.error('Error al redimir cupón:', err);
    res.status(500).json({ error: 'Error al redimir cupón' });
  }
};

// --- Listas de Precios ---
exports.getAllPriceLists = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const lists = await knex('price_lists').where('business_id', businessId).orderBy('name');
    res.json(lists);
  } catch (err) {
    console.error('Error al obtener listas de precios:', err);
    res.status(500).json({ error: 'Error al obtener listas de precios' });
  }
};

exports.createPriceList = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { name, items } = req.body;

    const listId = await knex.transaction(async (trx) => {
      const [list] = await trx('price_lists').insert({
        business_id: businessId,
        name
      }).returning('*');

      if (items && items.length > 0) {
        for (const item of items) {
          await trx('price_list_items').insert({
            price_list_id: list.id,
            product_id: item.product_id,
            custom_price: parseFloat(item.custom_price)
          });
        }
      }
      return list.id;
    });

    res.status(201).json({ id: listId, message: 'Lista de precios creada' });
  } catch (err) {
    console.error('Error al crear lista de precios:', err);
    res.status(500).json({ error: 'Error al crear lista de precios' });
  }
};

exports.getPriceListItems = async (req, res) => {
  try {
    const items = await knex('price_list_items as pli')
      .join('products as p', 'pli.product_id', 'p.id')
      .select('pli.*', 'p.name as product_name', 'p.price as base_price')
      .where('pli.price_list_id', req.params.id);
    res.json(items);
  } catch (err) {
    console.error('Error al obtener items de lista:', err);
    res.status(500).json({ error: 'Error al obtener items' });
  }
};
