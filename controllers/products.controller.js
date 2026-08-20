/**
 * Products Controller — Multi-tenant
 * Productos filtrados por business_id con soporte para branch_id global
 */
const knex = require('../database/knex');
const { addTenantFilter } = require('../middleware/tenant');

exports.getAll = async (req, res) => {
  try {
    const { category_id, search } = req.query;

    let query = knex('products as p')
      .join('categories as c', 'p.category_id', 'c.id')
      .select('p.*', 'c.name as category_name')
      .where('p.is_available', true);

    addTenantFilter(query, req.tenant, { allowGlobalBranch: true, tableAlias: 'p' });

    if (category_id) {
      query.andWhere('p.category_id', parseInt(category_id, 10));
    }
    if (search) {
      query.andWhere('p.name', 'ilike', `%${search}%`);
    }

    const products = await query.orderBy('c.sort_order').orderBy('p.name');
    res.json(products);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const product = await knex('products as p')
      .join('categories as c', 'p.category_id', 'c.id')
      .select('p.*', 'c.name as category_name')
      .where({ 'p.id': req.params.id, 'p.business_id': businessId })
      .first();

    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    console.error('Error al obtener producto:', err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
};

exports.create = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const {
      name, price, cost_price, barcode, sku, unit_of_measure,
      track_inventory, min_stock, tax_rate, tax_included, category_id,
      description, image_url, branch_id
    } = req.body;

    if (!name || price === undefined || price === null || !category_id) {
      return res.status(400).json({ error: 'Nombre, precio y categoría son requeridos' });
    }

    const parsedCategoryId = parseInt(category_id, 10);
    const category = await knex('categories')
      .where({ id: parsedCategoryId, business_id: businessId })
      .first();

    if (!category) {
      return res.status(400).json({ error: 'La categoría seleccionada no existe en tu negocio' });
    }

    const [product] = await knex('products').insert({
      business_id: businessId,
      branch_id: branch_id || null,
      category_id: parsedCategoryId,
      name,
      description: description || null,
      price: parseFloat(price),
      cost_price: (cost_price !== undefined && cost_price !== null && !isNaN(parseFloat(cost_price))) ? parseFloat(cost_price) : 0,
      barcode: barcode || null,
      sku: sku || null,
      unit_of_measure: unit_of_measure || 'unidad',
      track_inventory: track_inventory !== undefined ? Boolean(track_inventory) : false,
      min_stock: (min_stock !== undefined && min_stock !== null && !isNaN(parseInt(min_stock, 10))) ? parseInt(min_stock, 10) : 0,
      tax_rate: (tax_rate !== undefined && tax_rate !== null && !isNaN(parseFloat(tax_rate))) ? parseFloat(tax_rate) : 0.0,
      tax_included: tax_included !== undefined ? Boolean(tax_included) : true,
      image_url: image_url || null
    }).returning('*');

    // Si track_inventory es true y hay sucursal activa, inicializar registro de inventario en 0
    if (product.track_inventory && req.tenant.branchId) {
      const existingInv = await knex('inventory')
        .where({ branch_id: req.tenant.branchId, product_id: product.id })
        .first();
      if (!existingInv) {
        await knex('inventory').insert({
          business_id: businessId,
          branch_id: req.tenant.branchId,
          product_id: product.id,
          quantity: 0
        });
      }
    }

    res.status(201).json({ id: product.id, message: 'Producto creado exitosamente', product });
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
};

exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const existing = await knex('products')
      .where({ id, business_id: businessId })
      .first();

    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const {
      name, price, cost_price, barcode, sku, unit_of_measure,
      track_inventory, min_stock, tax_rate, tax_included,
      category_id, description, image_url
    } = req.body;

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (price !== undefined && price !== null && !isNaN(parseFloat(price))) {
      updateData.price = parseFloat(price);
    }
    if (cost_price !== undefined && cost_price !== null && !isNaN(parseFloat(cost_price))) {
      updateData.cost_price = parseFloat(cost_price);
    }
    if (barcode !== undefined) updateData.barcode = barcode || null;
    if (sku !== undefined) updateData.sku = sku || null;
    if (unit_of_measure !== undefined) updateData.unit_of_measure = unit_of_measure;
    if (track_inventory !== undefined) updateData.track_inventory = Boolean(track_inventory);
    if (min_stock !== undefined && min_stock !== null && !isNaN(parseInt(min_stock, 10))) {
      updateData.min_stock = parseInt(min_stock, 10);
    }
    if (tax_rate !== undefined && tax_rate !== null && !isNaN(parseFloat(tax_rate))) {
      updateData.tax_rate = parseFloat(tax_rate);
    }
    if (tax_included !== undefined && tax_included !== null) {
      updateData.tax_included = Boolean(tax_included);
    }
    if (category_id !== undefined && category_id !== null && !isNaN(parseInt(category_id, 10))) {
      const cat = await knex('categories').where({ id: parseInt(category_id, 10), business_id: businessId }).first();
      if (cat) updateData.category_id = cat.id;
    }
    if (description !== undefined) updateData.description = description || null;
    if (image_url !== undefined) updateData.image_url = image_url || null;

    updateData.updated_at = knex.fn.now();

    await knex('products')
      .where({ id, business_id: businessId })
      .update(updateData);

    res.json({ message: 'Producto actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
};

exports.remove = async (req, res) => {
  const { businessId } = req.tenant;
  try {
    await knex('products')
      .where({ id: req.params.id, business_id: businessId })
      .update({ is_available: false, updated_at: knex.fn.now() });
    res.json({ message: 'Producto eliminado lógicamente' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
};
