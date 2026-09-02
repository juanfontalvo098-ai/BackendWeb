/**
 * Inventory Controller — Multi-tenant
 * Stock actual, alertas de bajo stock, movimientos (Kardex), ajustes manuales
 */
const knex = require('../database/knex');
const ExcelJS = require('exceljs');

// Obtener stock actual de todos los productos por sucursal
exports.getStock = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { search, category_id, low_stock_only } = req.query;

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    let query = knex('products as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .leftJoin('inventory as inv', function() {
        this.on('p.id', '=', 'inv.product_id')
          .andOn('inv.branch_id', '=', knex.raw('?', [targetBranchId]));
      })
      .leftJoin('branches as b', function() {
        this.on('inv.branch_id', '=', 'b.id')
          .orOn('b.id', '=', knex.raw('?', [targetBranchId]));
      })
      .select(
        'p.id as product_id',
        'p.id',
        'p.name as product_name',
        'p.name',
        'p.sku',
        'p.barcode',
        'p.unit_of_measure',
        'p.min_stock',
        'p.cost_price',
        'p.price',
        'p.track_inventory',
        'p.is_available',
        'c.name as category_name',
        'b.name as branch_name',
        knex.raw('COALESCE(inv.quantity, 0)::float as quantity'),
        knex.raw('COALESCE(inv.reserved_quantity, 0)::float as reserved_quantity'),
        'inv.id as inventory_id'
      )
      .where('p.business_id', businessId);

    if (search) {
      query.andWhere(function() {
        this.where('p.name', 'ilike', `%${search}%`)
          .orWhere('p.sku', 'ilike', `%${search}%`)
          .orWhere('p.barcode', 'ilike', `%${search}%`)
          .orWhere('c.name', 'ilike', `%${search}%`);
      });
    }

    if (category_id) query.andWhere('p.category_id', parseInt(category_id, 10));

    if (low_stock_only === 'true') {
      query.whereRaw('COALESCE(inv.quantity, 0) <= p.min_stock');
    }

    const products = await query.orderBy('p.id', 'asc');

    // Correlativo relativo (#1, #2, #3...)
    const indexed = products.map((p, index) => ({
      ...p,
      business_relative_id: index + 1,
      quantity: parseFloat(p.quantity || 0),
      reserved_quantity: parseFloat(p.reserved_quantity || 0),
      cost_price: parseFloat(p.cost_price || 0),
      price: parseFloat(p.price || 0),
      min_stock: parseFloat(p.min_stock || 0)
    }));

    // Calcular valorización total
    const valuation = indexed.reduce((acc, item) => {
      acc.totalItems += Math.max(0, parseFloat(item.quantity));
      acc.totalValue += Math.max(0, parseFloat(item.quantity)) * parseFloat(item.cost_price || 0);
      return acc;
    }, { totalItems: 0, totalValue: 0 });

    res.json({ stock: indexed, valuation });
  } catch (err) {
    console.error('Error al obtener stock:', err);
    res.status(500).json({ error: 'Error al obtener stock: ' + err.message });
  }
};

// Obtener alertas de bajo stock
exports.getLowStockAlerts = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    let query = knex('products as p')
      .leftJoin('inventory as inv', function() {
        this.on('p.id', '=', 'inv.product_id')
          .andOn('inv.branch_id', '=', knex.raw('?', [targetBranchId]));
      })
      .leftJoin('branches as b', function() {
        this.on('inv.branch_id', '=', 'b.id')
          .orOn('b.id', '=', knex.raw('?', [targetBranchId]));
      })
      .select(
        'p.id as product_id',
        'p.name as product_name',
        'p.min_stock',
        'p.unit_of_measure',
        'b.name as branch_name',
        knex.raw('COALESCE(inv.quantity, 0)::float as quantity')
      )
      .where('p.business_id', businessId)
      .whereRaw('COALESCE(inv.quantity, 0) <= p.min_stock');

    const alerts = await query.orderBy('quantity', 'asc');
    res.json(alerts);
  } catch (err) {
    console.error('Error al obtener alertas:', err);
    res.status(500).json({ error: 'Error al obtener alertas de stock' });
  }
};

// Obtener Kardex (movimientos) de un producto
exports.getMovements = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { product_id, startDate, endDate, movement_type } = req.query;

    let query = knex('inventory_movements as im')
      .join('products as p', 'im.product_id', 'p.id')
      .leftJoin('users as u', 'im.user_id', 'u.id')
      .leftJoin('branches as b', 'im.branch_id', 'b.id')
      .select(
        'im.*',
        'p.name as product_name',
        'u.full_name as user_name',
        'u.username',
        'b.name as branch_name'
      )
      .where('im.business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('im.branch_id', branchId);
    }
    if (product_id) query.andWhere('im.product_id', parseInt(product_id, 10));
    if (movement_type) query.andWhere('im.movement_type', movement_type);
    if (startDate && endDate) {
      query.whereRaw('DATE(im.created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const movements = await query.orderBy('im.created_at', 'desc').limit(500);
    res.json(movements);
  } catch (err) {
    console.error('Error al obtener movimientos:', err);
    res.status(500).json({ error: 'Error al obtener movimientos de inventario' });
  }
};

// Ajuste manual de inventario
exports.adjustStock = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { product_id, quantity, adjustment_type, notes } = req.body;

    if (!product_id || quantity === undefined) {
      return res.status(400).json({ error: 'Producto y cantidad son requeridos' });
    }

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    const product = await knex('products').where({ id: product_id, business_id: businessId }).first();
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    await knex.transaction(async (trx) => {
      let inv = await trx('inventory')
        .where({ branch_id: targetBranchId, product_id })
        .first();

      if (!inv) {
        [inv] = await trx('inventory').insert({
          business_id: businessId,
          branch_id: targetBranchId,
          product_id,
          quantity: 0
        }).returning('*');
      }

      let newQuantity;
      let movementQty;
      if (adjustment_type === 'set') {
        movementQty = parseFloat(quantity) - parseFloat(inv.quantity);
        newQuantity = parseFloat(quantity);
      } else if (adjustment_type === 'add') {
        movementQty = parseFloat(quantity);
        newQuantity = parseFloat(inv.quantity) + movementQty;
      } else {
        movementQty = -parseFloat(quantity);
        newQuantity = parseFloat(inv.quantity) + movementQty;
      }

      await trx('inventory')
        .where({ id: inv.id })
        .update({ quantity: newQuantity, updated_at: knex.fn.now() });

      await trx('inventory_movements').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        product_id,
        movement_type: 'ajuste',
        quantity: movementQty,
        unit_cost: product.cost_price || 0,
        balance_after: newQuantity,
        reference_type: 'adjustment',
        notes: notes || `Ajuste manual: ${adjustment_type} ${quantity}`,
        user_id: userId
      });
    });

    res.json({ message: 'Stock ajustado exitosamente' });
  } catch (err) {
    console.error('Error al ajustar stock:', err);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
};

// Registrar merma
exports.registerWaste = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { product_id, quantity, notes } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'Producto y cantidad son requeridos' });
    }

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    await knex.transaction(async (trx) => {
      let inv = await trx('inventory')
        .where({ branch_id: targetBranchId, product_id })
        .first();

      if (!inv) {
        [inv] = await trx('inventory').insert({
          business_id: businessId,
          branch_id: targetBranchId,
          product_id,
          quantity: 0
        }).returning('*');
      }

      const product = await trx('products').where({ id: product_id }).first();
      const wasteQty = parseFloat(quantity);
      const newQuantity = parseFloat(inv.quantity) - wasteQty;

      await trx('inventory')
        .where({ id: inv.id })
        .update({ quantity: newQuantity, updated_at: knex.fn.now() });

      await trx('inventory_movements').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        product_id,
        movement_type: 'merma',
        quantity: -wasteQty,
        unit_cost: product?.cost_price || 0,
        balance_after: newQuantity,
        reference_type: 'waste',
        notes: notes || 'Merma / desperdicio registrado',
        user_id: userId
      });
    });

    res.json({ message: 'Merma registrada exitosamente' });
  } catch (err) {
    console.error('Error al registrar merma:', err);
    res.status(500).json({ error: 'Error al registrar merma' });
  }
};

// Transferir entre sucursales
exports.transferStock = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { product_id, to_branch_id, quantity, notes } = req.body;

    if (!product_id || !to_branch_id || !quantity) {
      return res.status(400).json({ error: 'Producto, sucursal destino y cantidad son requeridos' });
    }

    let originBranchId = branchId;
    if (!originBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      originBranchId = defaultBranch?.id;
    }

    if (originBranchId === to_branch_id) {
      return res.status(400).json({ error: 'La sucursal origen y destino no pueden ser la misma' });
    }

    await knex.transaction(async (trx) => {
      const product = await trx('products').where({ id: product_id }).first();
      const transferQty = parseFloat(quantity);

      // Descontar origen
      let sourceInv = await trx('inventory')
        .where({ branch_id: originBranchId, product_id })
        .first();

      if (!sourceInv) {
        [sourceInv] = await trx('inventory').insert({
          business_id: businessId,
          branch_id: originBranchId,
          product_id,
          quantity: 0
        }).returning('*');
      }

      const newSourceQty = parseFloat(sourceInv.quantity) - transferQty;
      await trx('inventory')
        .where({ id: sourceInv.id })
        .update({ quantity: newSourceQty, updated_at: knex.fn.now() });

      await trx('inventory_movements').insert({
        business_id: businessId,
        branch_id: originBranchId,
        product_id,
        movement_type: 'transferencia_salida',
        quantity: -transferQty,
        unit_cost: product?.cost_price || 0,
        balance_after: newSourceQty,
        reference_type: 'transfer',
        notes: `Transferencia a sucursal ${to_branch_id}. ${notes || ''}`,
        user_id: userId
      });

      // Sumar destino
      let targetInv = await trx('inventory')
        .where({ branch_id: to_branch_id, product_id })
        .first();

      if (!targetInv) {
        [targetInv] = await trx('inventory').insert({
          business_id: businessId,
          branch_id: to_branch_id,
          product_id,
          quantity: 0
        }).returning('*');
      }

      const newTargetQty = parseFloat(targetInv.quantity) + transferQty;
      await trx('inventory')
        .where({ id: targetInv.id })
        .update({ quantity: newTargetQty, updated_at: knex.fn.now() });

      await trx('inventory_movements').insert({
        business_id: businessId,
        branch_id: to_branch_id,
        product_id,
        movement_type: 'transferencia_entrada',
        quantity: transferQty,
        unit_cost: product?.cost_price || 0,
        balance_after: newTargetQty,
        reference_type: 'transfer',
        notes: `Transferencia desde sucursal ${originBranchId}. ${notes || ''}`,
        user_id: userId
      });
    });

    res.json({ message: 'Transferencia realizada exitosamente' });
  } catch (err) {
    console.error('Error al transferir stock:', err);
    res.status(500).json({ error: 'Error al transferir stock' });
  }
};

exports.transfer = exports.transferStock;

// ==================== DEDUCCIÓN AUTOMÁTICA ====================

// Descontar inventario de insumo
async function deductSingleSupply(trx, { businessId, branchId, supplyId, quantity, invoiceId, userId, notes }) {
  let inv = await trx('supplies_inventory')
    .where({ branch_id: branchId, supply_id: supplyId })
    .first();

  if (!inv) {
    [inv] = await trx('supplies_inventory').insert({
      business_id: businessId,
      branch_id: branchId,
      supply_id: supplyId,
      quantity: 0
    }).returning('*');
  }

  const supply = await trx('supplies').where({ id: supplyId }).first();
  const deductQty = parseFloat(quantity);
  const newBalance = parseFloat(inv.quantity) - deductQty;

  await trx('supplies_inventory')
    .where({ id: inv.id })
    .update({ quantity: newBalance, updated_at: trx.fn.now() });

  await trx('supplies_movements').insert({
    business_id: businessId,
    branch_id: branchId,
    supply_id: supplyId,
    movement_type: 'salida_venta',
    quantity: -deductQty,
    unit_cost: supply ? parseFloat(supply.cost_price || 0) : 0,
    balance_after: newBalance,
    notes: notes || `Deducción automática por Factura #${invoiceId}`,
    user_id: userId
  });
}

// Descontar inventario de producto terminado
async function deductSingleProduct(trx, { businessId, branchId, productId, quantity, invoiceId, userId }) {
  let inv = await trx('inventory')
    .where({ branch_id: branchId, product_id: productId })
    .first();

  if (!inv) {
    [inv] = await trx('inventory').insert({
      business_id: businessId,
      branch_id: branchId,
      product_id: productId,
      quantity: 0
    }).returning('*');
  }

  const product = await trx('products').where({ id: productId }).first();
  const deductQty = parseFloat(quantity);
  const newBalance = parseFloat(inv.quantity) - deductQty;

  await trx('inventory')
    .where({ id: inv.id })
    .update({ quantity: newBalance, updated_at: trx.fn.now() });

  await trx('inventory_movements').insert({
    business_id: businessId,
    branch_id: branchId,
    product_id: productId,
    movement_type: 'salida_venta',
    quantity: -deductQty,
    unit_cost: product ? parseFloat(product.cost_price || 0) : 0,
    balance_after: newBalance,
    reference_type: 'invoice',
    reference_id: invoiceId,
    notes: `Venta Factura #${invoiceId}`,
    user_id: userId
  });
}

// Descontar inventario al facturar (soporta argumentos posicionales u objeto)
exports.deductStockForInvoice = async (trx, arg2, arg3, arg4, arg5, arg6) => {
  let businessId, branchId, invoiceId, items, userId;
  if (typeof arg2 === 'object' && !Array.isArray(arg2) && arg2 !== null && arg2.businessId) {
    businessId = arg2.businessId;
    branchId = arg2.branchId;
    invoiceId = arg2.invoiceId;
    items = arg2.items;
    userId = arg2.userId;
  } else {
    businessId = arg2;
    branchId = arg3;
    items = arg4;
    userId = arg5;
    invoiceId = arg6;
  }

  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    const prodId = item.product_id || item.productId || item.id;
    if (!prodId) continue;

    const itemQty = parseFloat(item.quantity) || 1;

    // 1. Descontar insumos de la receta base fija (si el producto tiene receta)
    const recipe = await trx('recipes')
      .where({ product_id: prodId, business_id: businessId })
      .first();

    if (recipe) {
      const recipeItems = await trx('recipe_items').where({ recipe_id: recipe.id });
      for (const rItem of recipeItems) {
        if (rItem.supply_id) {
          const neededSupplyQty = (parseFloat(rItem.quantity) || 0) * itemQty;
          await deductSingleSupply(trx, {
            businessId,
            branchId,
            supplyId: rItem.supply_id,
            quantity: neededSupplyQty,
            invoiceId,
            userId,
            notes: `Deducción por Factura #${invoiceId} (Receta base)`
          });
        }
      }
    } else {
      await deductSingleProduct(trx, {
        businessId,
        branchId,
        productId: prodId,
        quantity: itemQty,
        invoiceId,
        userId
      });
    }

    // 2. Descontar insumos de modificadores, sabores y toppings seleccionados para este ítem
    const rawModifiers = item.modifiers_json || item.modifiers;
    if (rawModifiers) {
      let parsedModifiers = [];
      try {
        parsedModifiers = typeof rawModifiers === 'string' ? JSON.parse(rawModifiers) : rawModifiers;
      } catch (e) {
        parsedModifiers = Array.isArray(rawModifiers) ? rawModifiers : [];
      }

      if (Array.isArray(parsedModifiers)) {
        for (const mod of parsedModifiers) {
          let supplyId = mod.supply_id ? parseInt(mod.supply_id, 10) : null;
          let supplyQuantity = parseFloat(mod.supply_quantity) || 0;

          // Si el modificador no tiene supply_id directo en el snapshot, buscarlo en la base de datos
          if (!supplyId && (mod.option_id || mod.id)) {
            const optId = mod.option_id || mod.id;
            const dbOption = await trx('product_modifier_options').where('id', optId).first();
            if (dbOption && dbOption.supply_id) {
              supplyId = parseInt(dbOption.supply_id, 10);
              if (supplyQuantity <= 0 && dbOption.supply_quantity) {
                supplyQuantity = parseFloat(dbOption.supply_quantity);
              }
            }
          }

          if (supplyId && supplyQuantity > 0) {
            const modQty = parseFloat(mod.quantity || 1);
            const neededSupplyQty = supplyQuantity * modQty * itemQty;
            if (neededSupplyQty > 0) {
              await deductSingleSupply(trx, {
                businessId,
                branchId,
                supplyId,
                quantity: neededSupplyQty,
                invoiceId,
                userId,
                notes: `Deducción por Factura #${invoiceId} (Sabor/Topping: ${mod.name || 'Modificador'} x${modQty})`
              });
            }
          }
        }
      }
    }
  }
};

// ==================== EXPORTACIÓN DE STOCK (EXCEL) ====================

exports.exportStockExcel = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    const settings = await knex('settings')
      .where('business_id', businessId)
      .whereNull('branch_id')
      .first() || { business_name: 'GastrosPOS ERP' };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name || 'GastrosPOS ERP';
    workbook.created = new Date();

    // 1. Hoja Productos Terminados
    const sheetProducts = workbook.addWorksheet('Productos Terminados');
    sheetProducts.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nombre del Producto', key: 'name', width: 30 },
      { header: 'Categoría', key: 'category_name', width: 20 },
      { header: 'SKU / Código', key: 'sku', width: 16 },
      { header: 'Unidad', key: 'unit_of_measure', width: 12 },
      { header: 'Stock Actual', key: 'quantity', width: 14 },
      { header: 'Stock Mínimo', key: 'min_stock', width: 14 },
      { header: 'Costo Unitario', key: 'cost_price', width: 16 },
      { header: 'Precio Venta', key: 'price', width: 16 },
      { header: 'Valor Total Stock', key: 'total_value', width: 18 }
    ];

    sheetProducts.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    const products = await knex('products as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .leftJoin('inventory as inv', function() {
        this.on('p.id', '=', 'inv.product_id')
          .andOn('inv.branch_id', '=', knex.raw('?', [targetBranchId]));
      })
      .select(
        'p.id',
        'p.name',
        'p.sku',
        'p.unit_of_measure',
        'p.min_stock',
        'p.cost_price',
        'p.price',
        'c.name as category_name',
        knex.raw('COALESCE(inv.quantity, 0)::float as quantity')
      )
      .where('p.business_id', businessId)
      .orderBy('c.name', 'asc')
      .orderBy('p.name', 'asc');

    products.forEach(p => {
      const qty = parseFloat(p.quantity || 0);
      const cost = parseFloat(p.cost_price || 0);
      const totalVal = qty * cost;

      const row = sheetProducts.addRow({
        id: p.id,
        name: p.name,
        category_name: p.category_name || 'General',
        sku: p.sku || '---',
        unit_of_measure: p.unit_of_measure || 'UND',
        quantity: qty,
        min_stock: parseFloat(p.min_stock || 0),
        cost_price: cost,
        price: parseFloat(p.price || 0),
        total_value: totalVal
      });
      [8, 9, 10].forEach(c => { row.getCell(c).numFmt = '"$"#,##0'; });
    });

    // 2. Hoja Insumos y Materias Primas
    const sheetSupplies = workbook.addWorksheet('Insumos y Materias Primas');
    sheetSupplies.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nombre del Insumo', key: 'name', width: 30 },
      { header: 'Categoría Insumo', key: 'category', width: 20 },
      { header: 'SKU / Código', key: 'sku', width: 16 },
      { header: 'Unidad de Medida', key: 'unit_of_measure', width: 16 },
      { header: 'Stock Actual', key: 'quantity', width: 14 },
      { header: 'Stock Mínimo', key: 'min_stock', width: 14 },
      { header: 'Stock Ideal', key: 'ideal_stock', width: 14 },
      { header: 'Costo Unitario', key: 'cost_price', width: 16 },
      { header: 'Valorización Total', key: 'total_value', width: 18 }
    ];

    sheetSupplies.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    });

    const supplies = await knex('supplies as s')
      .leftJoin('supplies_inventory as sinv', function() {
        this.on('s.id', '=', 'sinv.supply_id')
          .andOn('sinv.branch_id', '=', knex.raw('?', [targetBranchId]));
      })
      .select(
        's.id',
        's.name',
        's.category',
        's.sku',
        's.unit_of_measure',
        's.cost_price',
        's.min_stock',
        's.ideal_stock',
        knex.raw('COALESCE(sinv.quantity, 0)::float as quantity')
      )
      .where('s.business_id', businessId)
      .andWhere('s.is_active', true)
      .orderBy('s.category', 'asc')
      .orderBy('s.name', 'asc');

    supplies.forEach(s => {
      const qty = parseFloat(s.quantity || 0);
      const cost = parseFloat(s.cost_price || 0);
      const totalVal = qty * cost;

      const row = sheetSupplies.addRow({
        id: s.id,
        name: s.name,
        category: s.category || 'General',
        sku: s.sku || '---',
        unit_of_measure: s.unit_of_measure || 'kg',
        quantity: qty,
        min_stock: parseFloat(s.min_stock || 0),
        ideal_stock: parseFloat(s.ideal_stock || 0),
        cost_price: cost,
        total_value: totalVal
      });
      [9, 10].forEach(c => { row.getCell(c).numFmt = '"$"#,##0'; });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Inventario_Stock_Productos_e_Insumos_${new Date().toISOString().slice(0,10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar inventario a Excel:', err);
    res.status(500).json({ error: 'Error al exportar inventario a Excel' });
  }
};

