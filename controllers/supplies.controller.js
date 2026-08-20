/**
 * Supplies Controller — Multi-tenant
 * Gestión completa de Insumos, Materias Primas, Stock por Sucursal y Kardex
 */
const knex = require('../database/knex');

// Obtener todos los insumos con stock de la sucursal actual
exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { category, search, is_active } = req.query;

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    let query = knex('supplies as s')
      .leftJoin('supplies_inventory as si', function() {
        this.on('s.id', '=', 'si.supply_id')
          .andOn('si.branch_id', '=', knex.raw('?', [targetBranchId]));
      })
      .leftJoin('suppliers as sup', 's.supplier_id', 'sup.id')
      .leftJoin('supply_categories as sc', 's.category_id', 'sc.id')
      .select(
        's.*',
        knex.raw('COALESCE(sc.name, s.category, \'General\') as category_name'),
        'sc.color as category_color',
        knex.raw('COALESCE(si.quantity, 0) as current_stock'),
        knex.raw('COALESCE(si.reserved_quantity, 0) as reserved_stock'),
        'sup.name as supplier_name'
      )
      .where('s.business_id', businessId);

    if (is_active !== undefined) {
      query.andWhere('s.is_active', is_active === 'true');
    } else {
      query.andWhere('s.is_active', true);
    }

    if (category) {
      query.andWhere(function() {
        this.where('s.category', category)
          .orWhere('sc.name', category);
      });
    }

    if (search) {
      query.andWhere(function() {
        this.where('s.name', 'ilike', `%${search}%`)
          .orWhere('s.sku', 'ilike', `%${search}%`)
          .orWhere('s.category', 'ilike', `%${search}%`)
          .orWhere('sc.name', 'ilike', `%${search}%`);
      });
    }

    query.orderBy('s.id', 'asc');

    const supplies = await query;

    // Asignar correlativo relativo al negocio (#1, #2, #3...)
    const indexedSupplies = supplies.map((s, index) => ({
      ...s,
      category: s.category_name || s.category || 'General',
      business_relative_id: index + 1,
      current_stock: parseFloat(s.current_stock || 0),
      reserved_stock: parseFloat(s.reserved_stock || 0),
      cost_price: parseFloat(s.cost_price || 0),
      min_stock: parseFloat(s.min_stock || 0),
      ideal_stock: parseFloat(s.ideal_stock || 0)
    }));

    res.json(indexedSupplies);
  } catch (err) {
    console.error('Error al obtener insumos:', err);
    res.status(500).json({ error: 'Error al consultar catálogo de insumos' });
  }
};

// Obtener un insumo por ID con desglose por sucursal
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    const supply = await knex('supplies as s')
      .leftJoin('suppliers as sup', 's.supplier_id', 'sup.id')
      .select('s.*', 'sup.name as supplier_name')
      .where({ 's.id': id, 's.business_id': businessId })
      .first();

    if (!supply) return res.status(404).json({ error: 'Insumo no encontrado' });

    // Stock en todas las sucursales
    const stocks = await knex('supplies_inventory as si')
      .join('branches as b', 'si.branch_id', 'b.id')
      .select('si.*', 'b.name as branch_name')
      .where({ 'si.supply_id': id, 'si.business_id': businessId });

    // Últimos movimientos del insumo
    const movements = await knex('supplies_movements as sm')
      .leftJoin('users as u', 'sm.user_id', 'u.id')
      .select('sm.*', 'u.full_name as user_name')
      .where('sm.supply_id', id)
      .orderBy('sm.id', 'desc')
      .limit(20);

    res.json({ ...supply, stocks, movements });
  } catch (err) {
    console.error('Error al consultar detalle del insumo:', err);
    res.status(500).json({ error: 'Error al consultar insumo' });
  }
};

// Crear nuevo insumo
exports.create = async (req, res) => {
  const {
    name, sku, barcode, category, category_id, unit_of_measure,
    cost_price, min_stock, ideal_stock, supplier_id,
    description, initial_stock
  } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del insumo es obligatorio' });
  }

  try {
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    let parsedCatId = category_id ? parseInt(category_id, 10) : null;
    let catName = category || 'General';

    if (parsedCatId) {
      const supCat = await knex('supply_categories').where('id', parsedCatId).first();
      if (supCat) catName = supCat.name;
    } else if (category) {
      const supCat = await knex('supply_categories').where({ business_id: businessId, name: category.trim() }).first();
      if (supCat) parsedCatId = supCat.id;
    }

    const [newSupply] = await knex('supplies').insert({
      business_id: businessId,
      name: name.trim(),
      sku: sku || null,
      barcode: barcode || null,
      category: catName,
      category_id: parsedCatId,
      unit_of_measure: unit_of_measure || 'kg',
      cost_price: parseFloat(cost_price) || 0,
      min_stock: parseFloat(min_stock) || 5,
      ideal_stock: parseFloat(ideal_stock) || 20,
      supplier_id: supplier_id ? parseInt(supplier_id, 10) : null,
      description: description || null,
      is_active: true
    }).returning('*');

    // Inicializar inventario en la sucursal activa
    const initQty = parseFloat(initial_stock) || 0;
    if (targetBranchId) {
      await knex('supplies_inventory').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        supply_id: newSupply.id,
        quantity: initQty
      });

      if (initQty > 0) {
        await knex('supplies_movements').insert({
          business_id: businessId,
          branch_id: targetBranchId,
          supply_id: newSupply.id,
          movement_type: 'ajuste',
          quantity: initQty,
          unit_cost: parseFloat(cost_price) || 0,
          balance_after: initQty,
          notes: 'Inventario inicial al crear insumo',
          user_id
        });
      }
    }

    res.status(201).json(newSupply);
  } catch (err) {
    console.error('Error al crear insumo:', err);
    res.status(500).json({ error: 'Error al registrar insumo: ' + err.message });
  }
};

// Actualizar insumo
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    name, sku, barcode, category, category_id, unit_of_measure,
    cost_price, min_stock, ideal_stock, supplier_id,
    description, is_active
  } = req.body;
  const { businessId } = req.tenant;

  try {
    const supply = await knex('supplies').where({ id, business_id: businessId }).first();
    if (!supply) return res.status(404).json({ error: 'Insumo no encontrado' });

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (sku !== undefined) updateData.sku = sku;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (unit_of_measure !== undefined) updateData.unit_of_measure = unit_of_measure;
    if (cost_price !== undefined) updateData.cost_price = parseFloat(cost_price) || 0;
    if (min_stock !== undefined) updateData.min_stock = parseFloat(min_stock) || 0;
    if (ideal_stock !== undefined) updateData.ideal_stock = parseFloat(ideal_stock) || 0;
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id ? parseInt(supplier_id, 10) : null;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (category_id !== undefined) {
      const parsedCatId = category_id ? parseInt(category_id, 10) : null;
      updateData.category_id = parsedCatId;
      if (parsedCatId) {
        const supCat = await knex('supply_categories').where('id', parsedCatId).first();
        if (supCat) updateData.category = supCat.name;
      }
    } else if (category !== undefined) {
      updateData.category = category;
      const supCat = await knex('supply_categories').where({ business_id: businessId, name: category.trim() }).first();
      if (supCat) updateData.category_id = supCat.id;
    }

    updateData.updated_at = knex.fn.now();

    const [updated] = await knex('supplies')
      .where({ id, business_id: businessId })
      .update(updateData)
      .returning('*');

    res.json(updated);
  } catch (err) {
    console.error('Error al actualizar insumo:', err);
    res.status(500).json({ error: 'Error al actualizar insumo' });
  }
};

// Eliminar o desactivar insumo
exports.remove = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    // Verificar si el insumo está en uso en alguna receta
    const inRecipes = await knex('recipe_items').where('supply_id', id).first();
    if (inRecipes) {
      // Desactivar suavemente
      await knex('supplies').where({ id, business_id: businessId }).update({ is_active: false });
      return res.json({ message: 'El insumo está enlazado a recetas activas; se ha desactivado del catálogo.' });
    }

    await knex('supplies').where({ id, business_id: businessId }).del();
    res.json({ message: 'Insumo eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar insumo:', err);
    res.status(500).json({ error: 'Error al eliminar insumo' });
  }
};

// Ajustar stock manual o registrar entrada/merma de insumo
exports.adjustStock = async (req, res) => {
  const { id } = req.params;
  const { quantity, movement_type, notes, unit_cost } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  if (quantity === undefined || isNaN(parseFloat(quantity))) {
    return res.status(400).json({ error: 'La cantidad es requerida' });
  }

  let targetBranchId = branchId;
  if (!targetBranchId) {
    const defaultBranch = await knex('branches').where('business_id', businessId).first();
    targetBranchId = defaultBranch?.id;
  }

  try {
    const supply = await knex('supplies').where({ id, business_id: businessId }).first();
    if (!supply) return res.status(404).json({ error: 'Insumo no encontrado' });

    const qty = parseFloat(quantity);
    const cost = unit_cost !== undefined ? parseFloat(unit_cost) : parseFloat(supply.cost_price || 0);

    const result = await knex.transaction(async (trx) => {
      let currentInv = await trx('supplies_inventory')
        .where({ branch_id: targetBranchId, supply_id: id })
        .first();

      if (!currentInv) {
        const [newInv] = await trx('supplies_inventory').insert({
          business_id: businessId,
          branch_id: targetBranchId,
          supply_id: id,
          quantity: 0
        }).returning('*');
        currentInv = newInv;
      }

      let newBalance = parseFloat(currentInv.quantity);
      const mType = movement_type || 'ajuste';

      if (mType === 'ajuste') {
        // En ajuste manual, la cantidad ingresada puede ser el nuevo balance absoluto o un delta
        newBalance = qty;
      } else if (mType === 'entrada_compra' || mType === 'transferencia_in') {
        newBalance += qty;
      } else if (mType === 'salida_receta_venta' || mType === 'merma' || mType === 'transferencia_out') {
        newBalance = Math.max(0, newBalance - qty);
      }

      await trx('supplies_inventory')
        .where({ branch_id: targetBranchId, supply_id: id })
        .update({ quantity: newBalance, updated_at: knex.fn.now() });

      const [movement] = await trx('supplies_movements').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        supply_id: id,
        movement_type: mType,
        quantity: qty,
        unit_cost: cost,
        balance_after: newBalance,
        notes: notes || `Ajuste manual de stock (${mType})`,
        user_id
      }).returning('*');

      return { newBalance, movement };
    });

    res.json({ message: 'Stock de insumo actualizado exitosamente', ...result });
  } catch (err) {
    console.error('Error al ajustar stock de insumo:', err);
    res.status(500).json({ error: 'Error al ajustar inventario: ' + err.message });
  }
};

// Consultar Kardex completo de Insumos
exports.getMovements = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { supply_id, movement_type, limit } = req.query;

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    let query = knex('supplies_movements as sm')
      .join('supplies as s', 'sm.supply_id', 's.id')
      .leftJoin('users as u', 'sm.user_id', 'u.id')
      .select(
        'sm.*',
        's.name as supply_name',
        's.unit_of_measure',
        's.category as supply_category',
        'u.full_name as user_name'
      )
      .where('sm.business_id', businessId);

    if (targetBranchId) query.andWhere('sm.branch_id', targetBranchId);
    if (supply_id) query.andWhere('sm.supply_id', supply_id);
    if (movement_type) query.andWhere('sm.movement_type', movement_type);

    query.orderBy('sm.id', 'desc').limit(parseInt(limit, 10) || 100);

    const movements = await query;
    res.json(movements);
  } catch (err) {
    console.error('Error al obtener movimientos de insumos:', err);
    res.status(500).json({ error: 'Error al consultar historial de movimientos' });
  }
};
