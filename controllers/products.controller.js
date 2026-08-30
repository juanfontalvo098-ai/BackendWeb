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
      description, image_url, branch_id, show_in_order_stats, is_third_party
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
      image_url: image_url || null,
      show_in_order_stats: show_in_order_stats !== undefined ? Boolean(show_in_order_stats) : false,
      is_third_party: is_third_party !== undefined ? Boolean(is_third_party) : false
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
      category_id, description, image_url, show_in_order_stats, is_third_party
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
    if (show_in_order_stats !== undefined) updateData.show_in_order_stats = Boolean(show_in_order_stats);
    if (is_third_party !== undefined) updateData.is_third_party = Boolean(is_third_party);

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

exports.importJson = async (req, res) => {
  const { businessId, branchId } = req.tenant;
  const { data, update_existing = true } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'No se enviaron datos JSON para importar' });
  }

  let categoriesInput = [];
  let productsInput = [];

  if (Array.isArray(data)) {
    // Es una lista directa de productos
    productsInput = data;
  } else if (typeof data === 'object') {
    // Es un objeto estructurado { categories: [...], products: [...] }
    if (Array.isArray(data.categories)) categoriesInput = data.categories;
    if (Array.isArray(data.products)) productsInput = data.products;
    else if (Array.isArray(data.items)) productsInput = data.items;
  }

  if (categoriesInput.length === 0 && productsInput.length === 0) {
    return res.status(400).json({ error: 'El archivo JSON no contiene productos ni categorías válidos' });
  }

  try {
    const result = await knex.transaction(async (trx) => {
      // 1. Obtener todas las categorías existentes del negocio en memoria
      const existingCategories = await trx('categories')
        .where('business_id', businessId)
        .where('is_active', true);
      
      const categoryMap = new Map();
      existingCategories.forEach(c => {
        categoryMap.set(c.name.trim().toLowerCase(), c);
      });

      let categoriesCreated = 0;

      // 2. Procesar categorías explícitas si vienen en el JSON
      for (const cat of categoriesInput) {
        if (!cat.name || !cat.name.trim()) continue;
        const normName = cat.name.trim().toLowerCase();
        if (!categoryMap.has(normName)) {
          const [newCat] = await trx('categories').insert({
            business_id: businessId,
            branch_id: branchId || null,
            name: cat.name.trim(),
            description: cat.description || null,
            sort_order: cat.sort_order !== undefined ? parseInt(cat.sort_order, 10) : existingCategories.length + categoriesCreated
          }).returning('*');
          categoryMap.set(normName, newCat);
          categoriesCreated++;
        }
      }

      // 3. Procesar productos
      let productsCreated = 0;
      let productsUpdated = 0;
      const errors = [];

      for (let i = 0; i < productsInput.length; i++) {
        const item = productsInput[i];
        if (!item.name || !item.name.trim()) {
          errors.push(`Fila ${i + 1}: El nombre del producto es obligatorio`);
          continue;
        }

        const price = parseFloat(item.price);
        if (isNaN(price) || price < 0) {
          errors.push(`Producto "${item.name}": El precio debe ser un número válido >= 0`);
          continue;
        }

        // Resolver categoría
        const catNameRaw = (item.category_name || item.category || item.categoria || 'General').toString().trim();
        const normCatName = catNameRaw.toLowerCase();
        let targetCategory = categoryMap.get(normCatName);

        if (!targetCategory) {
          // Crear categoría implícita automáticamente
          const [newCat] = await trx('categories').insert({
            business_id: businessId,
            branch_id: branchId || null,
            name: catNameRaw,
            description: `Categoría generada automáticamente al importar ${catNameRaw}`,
            sort_order: existingCategories.length + categoriesCreated
          }).returning('*');
          targetCategory = newCat;
          categoryMap.set(normCatName, newCat);
          categoriesCreated++;
        }

        const productData = {
          business_id: businessId,
          branch_id: branchId || null,
          category_id: targetCategory.id,
          name: item.name.trim(),
          description: item.description || null,
          price: price,
          cost_price: (item.cost_price !== undefined && !isNaN(parseFloat(item.cost_price))) ? parseFloat(item.cost_price) : 0,
          sku: item.sku ? item.sku.toString().trim() : null,
          barcode: item.barcode ? item.barcode.toString().trim() : null,
          unit_of_measure: item.unit_of_measure || item.unit || 'unidad',
          track_inventory: item.track_inventory !== undefined ? Boolean(item.track_inventory) : false,
          min_stock: (item.min_stock !== undefined && !isNaN(parseInt(item.min_stock, 10))) ? parseInt(item.min_stock, 10) : 0,
          tax_rate: (item.tax_rate !== undefined && !isNaN(parseFloat(item.tax_rate))) ? parseFloat(item.tax_rate) : 0.0,
          tax_included: item.tax_included !== undefined ? Boolean(item.tax_included) : true,
          image_url: item.image_url || null,
          is_available: item.is_available !== undefined ? Boolean(item.is_available) : true,
          updated_at: trx.fn.now()
        };

        // Buscar si ya existe por SKU o por Nombre + Categoría
        let existingProd = null;
        if (productData.sku) {
          existingProd = await trx('products')
            .where({ business_id: businessId, sku: productData.sku })
            .first();
        }
        if (!existingProd) {
          existingProd = await trx('products')
            .where({ business_id: businessId, category_id: targetCategory.id })
            .whereRaw('LOWER(name) = ?', [productData.name.toLowerCase()])
            .first();
        }

        if (existingProd && update_existing) {
          await trx('products').where('id', existingProd.id).update(productData);
          productsUpdated++;
        } else if (!existingProd) {
          const [inserted] = await trx('products').insert(productData).returning('*');
          productsCreated++;

          if (inserted.track_inventory && branchId) {
            const initStock = item.initial_stock !== undefined ? parseFloat(item.initial_stock) : 0;
            const existingInv = await trx('inventory')
              .where({ branch_id: branchId, product_id: inserted.id })
              .first();
            if (!existingInv) {
              await trx('inventory').insert({
                business_id: businessId,
                branch_id: branchId,
                product_id: inserted.id,
                current_stock: initStock,
                min_stock: inserted.min_stock,
                max_stock: 1000,
                avg_cost: inserted.cost_price,
                last_cost: inserted.cost_price
              });
            }
          }
        }
      }

      return {
        categoriesCreated,
        productsCreated,
        productsUpdated,
        totalProcessed: productsInput.length,
        errors
      };
    });

    res.json({
      message: `Importación completada: ${result.productsCreated} productos creados, ${result.productsUpdated} actualizados, ${result.categoriesCreated} nuevas categorías.`,
      ...result
    });
  } catch (err) {
    console.error('Error al importar productos JSON:', err);
    res.status(500).json({ error: 'Error al importar catálogo desde JSON: ' + (err.message || 'Error interno') });
  }
};
