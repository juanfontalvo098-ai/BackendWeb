/**
 * Purchase Orders Controller — Multi-tenant
 * Soporta Insumos (Materia Prima) y Productos Terminados
 * Recepción con actualización automática de stock e inventario
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { status, supplier_id, startDate, endDate } = req.query;

    let query = knex('purchase_orders as po')
      .join('suppliers as s', 'po.supplier_id', 's.id')
      .join('users as u', 'po.user_id', 'u.id')
      .leftJoin('branches as b', 'po.branch_id', 'b.id')
      .select(
        'po.*',
        's.name as supplier_name',
        'u.full_name as user_name',
        knex.raw("COALESCE(b.name, 'Principal') as branch_name")
      )
      .where('po.business_id', businessId);

    if (branchId && !isGlobalScope) query.andWhere('po.branch_id', branchId);
    if (status) query.andWhere('po.status', status);
    if (supplier_id) query.andWhere('po.supplier_id', parseInt(supplier_id, 10));
    if (startDate && endDate) {
      query.whereRaw('po.order_date BETWEEN ? AND ?', [startDate, endDate]);
    }

    const orders = await query.orderBy('po.created_at', 'desc');
    res.json(orders);
  } catch (err) {
    console.error('Error al obtener órdenes de compra:', err);
    res.status(500).json({ error: 'Error al obtener órdenes de compra' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const po = await knex('purchase_orders as po')
      .join('suppliers as s', 'po.supplier_id', 's.id')
      .join('users as u', 'po.user_id', 'u.id')
      .leftJoin('branches as b', 'po.branch_id', 'b.id')
      .select(
        'po.*',
        's.name as supplier_name',
        'u.full_name as user_name',
        knex.raw("COALESCE(b.name, 'Principal') as branch_name")
      )
      .where({ 'po.id': req.params.id, 'po.business_id': businessId })
      .first();

    if (!po) return res.status(404).json({ error: 'Orden de compra no encontrada' });

    po.items = await knex('purchase_order_items as poi')
      .leftJoin('products as p', 'poi.product_id', 'p.id')
      .leftJoin('supplies as s', 'poi.supply_id', 's.id')
      .select(
        'poi.*',
        knex.raw("COALESCE(s.name, p.name) as item_name"),
        knex.raw("COALESCE(s.name, p.name) as product_name"),
        knex.raw("COALESCE(s.sku, p.sku) as sku"),
        knex.raw("COALESCE(s.unit_of_measure, p.unit_of_measure, 'und') as unit_of_measure"),
        knex.raw("CASE WHEN poi.supply_id IS NOT NULL THEN 'insumo' ELSE 'producto' END as item_type")
      )
      .where('poi.purchase_order_id', po.id);

    res.json(po);
  } catch (err) {
    console.error('Error al obtener OC:', err);
    res.status(500).json({ error: 'Error al obtener orden de compra' });
  }
};

exports.create = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { supplier_id, order_date, expected_date, notes, items, tax_rate, tax_total } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Proveedor e ítems son requeridos' });
    }

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    // Generar número de orden
    const count = await knex('purchase_orders').where('business_id', businessId).count('id as c').first();
    const orderNumber = `OC-${String(parseInt(count.c) + 1).padStart(6, '0')}`;

    let subtotal = 0;
    items.forEach(i => {
      subtotal += parseFloat(i.unit_cost || 0) * parseFloat(i.quantity_ordered || 0);
    });

    let calculatedTax = 0;
    if (tax_total !== undefined && tax_total !== null) {
      calculatedTax = parseFloat(tax_total) || 0;
    } else if (tax_rate !== undefined && tax_rate !== null && !isNaN(parseFloat(tax_rate))) {
      calculatedTax = subtotal * (parseFloat(tax_rate) / 100);
    } else {
      calculatedTax = 0;
    }

    const total = subtotal + calculatedTax;

    const poId = await knex.transaction(async (trx) => {
      const [po] = await trx('purchase_orders').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        supplier_id,
        order_number: orderNumber,
        order_date: order_date || new Date().toISOString().slice(0, 10),
        expected_date: expected_date || null,
        subtotal,
        tax_total: calculatedTax,
        total,
        notes: notes || null,
        user_id: userId
      }).returning('*');

      for (const item of items) {
        const isSupply = item.item_type === 'insumo' || Boolean(item.supply_id);
        await trx('purchase_order_items').insert({
          purchase_order_id: po.id,
          item_type: isSupply ? 'insumo' : 'producto',
          supply_id: isSupply ? (item.supply_id || item.id) : null,
          product_id: !isSupply ? (item.product_id || item.id) : null,
          quantity_ordered: parseFloat(item.quantity_ordered),
          quantity_received: 0,
          unit_cost: parseFloat(item.unit_cost || 0),
          subtotal: parseFloat(item.unit_cost || 0) * parseFloat(item.quantity_ordered || 0)
        });
      }

      return po.id;
    });

    res.status(201).json({ id: poId, order_number: orderNumber, message: 'Orden de compra creada exitosamente' });
  } catch (err) {
    console.error('Error al crear OC:', err);
    res.status(500).json({ error: 'Error al crear orden de compra: ' + err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { supplier_id, order_date, expected_date, notes, status } = req.body;

    const po = await knex('purchase_orders').where({ id, business_id: businessId }).first();
    if (!po) return res.status(404).json({ error: 'OC no encontrada' });
    if (['recibida', 'cancelada'].includes(po.status)) {
      return res.status(400).json({ error: 'No se puede modificar una OC recibida o cancelada' });
    }

    const updateData = { updated_at: knex.fn.now() };
    if (supplier_id) updateData.supplier_id = supplier_id;
    if (order_date) updateData.order_date = order_date;
    if (expected_date !== undefined) updateData.expected_date = expected_date || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (status) updateData.status = status;

    await knex('purchase_orders').where({ id }).update(updateData);
    res.json({ message: 'Orden de compra actualizada' });
  } catch (err) {
    console.error('Error al actualizar OC:', err);
    res.status(500).json({ error: 'Error al actualizar orden de compra' });
  }
};

// Recepción de mercancía — actualiza stock de insumo o producto
exports.receive = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { id } = req.params;
    const { items } = req.body; // [{ item_id, quantity_received }]

    const po = await knex('purchase_orders').where({ id, business_id: businessId }).first();
    if (!po) return res.status(404).json({ error: 'OC no encontrada' });
    if (po.status === 'cancelada') return res.status(400).json({ error: 'OC cancelada' });

    let targetBranchId = po.branch_id || branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    await knex.transaction(async (trx) => {
      let allReceived = true;

      for (const receivedItem of items) {
        const poItem = await trx('purchase_order_items').where('id', receivedItem.item_id).first();
        if (!poItem) continue;

        const qtyReceivedNow = parseFloat(receivedItem.quantity_received || 0);
        if (qtyReceivedNow <= 0) continue;

        const newReceivedTotal = parseFloat(poItem.quantity_received || 0) + qtyReceivedNow;

        await trx('purchase_order_items').where('id', poItem.id).update({
          quantity_received: newReceivedTotal
        });

        if (newReceivedTotal < parseFloat(poItem.quantity_ordered)) {
          allReceived = false;
        }

        if (poItem.supply_id) {
          // 1. Insumo / Materia Prima
          let supInv = await trx('supplies_inventory')
            .where({ branch_id: targetBranchId, supply_id: poItem.supply_id })
            .first();

          if (!supInv) {
            [supInv] = await trx('supplies_inventory').insert({
              business_id: businessId,
              branch_id: targetBranchId,
              supply_id: poItem.supply_id,
              quantity: 0
            }).returning('*');
          }

          const newSupQty = parseFloat(supInv.quantity || 0) + qtyReceivedNow;
          await trx('supplies_inventory').where({ id: supInv.id }).update({
            quantity: newSupQty,
            updated_at: trx.fn.now()
          });

          await trx('supplies_movements').insert({
            business_id: businessId,
            branch_id: targetBranchId,
            supply_id: poItem.supply_id,
            movement_type: 'entrada_compra',
            quantity: qtyReceivedNow,
            unit_cost: parseFloat(poItem.unit_cost || 0),
            balance_after: newSupQty,
            notes: `Recepción Orden de Compra ${po.order_number}`,
            user_id: userId
          });

          if (parseFloat(poItem.unit_cost) > 0) {
            await trx('supplies').where('id', poItem.supply_id).update({
              cost_price: parseFloat(poItem.unit_cost),
              updated_at: trx.fn.now()
            });
          }
        } else if (poItem.product_id) {
          // 2. Producto Terminado
          let prodInv = await trx('inventory')
            .where({ branch_id: targetBranchId, product_id: poItem.product_id })
            .first();

          if (!prodInv) {
            [prodInv] = await trx('inventory').insert({
              business_id: businessId,
              branch_id: targetBranchId,
              product_id: poItem.product_id,
              quantity: 0
            }).returning('*');
          }

          const newProdQty = parseFloat(prodInv.quantity || 0) + qtyReceivedNow;
          await trx('inventory').where({ id: prodInv.id }).update({
            quantity: newProdQty,
            updated_at: trx.fn.now()
          });

          await trx('inventory_movements').insert({
            business_id: businessId,
            branch_id: targetBranchId,
            product_id: poItem.product_id,
            movement_type: 'entrada',
            quantity: qtyReceivedNow,
            unit_cost: parseFloat(poItem.unit_cost || 0),
            balance_after: newProdQty,
            reference_type: 'purchase_order',
            reference_id: po.id,
            notes: `Recepción Orden de Compra ${po.order_number}`,
            user_id: userId
          });

          if (parseFloat(poItem.unit_cost) > 0) {
            await trx('products').where('id', poItem.product_id).update({
              cost_price: parseFloat(poItem.unit_cost),
              updated_at: trx.fn.now()
            });
          }
        }
      }

      const shouldClose = Boolean(req.body.close_order || req.body.force_close);
      const newStatus = allReceived ? 'recibida' : (shouldClose ? 'cerrada' : 'parcial');
      await trx('purchase_orders').where('id', id).update({
        status: newStatus,
        received_date: (allReceived || shouldClose) ? trx.fn.now() : null,
        updated_at: trx.fn.now()
      });
    });

    res.json({ message: 'Mercancía recibida y stock actualizado exitosamente' });
  } catch (err) {
    console.error('Error al recibir mercancía:', err);
    res.status(500).json({ error: 'Error al recibir mercancía: ' + err.message });
  }
};

exports.closeOrder = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { reason } = req.body;

    const po = await knex('purchase_orders').where({ id, business_id: businessId }).first();
    if (!po) return res.status(404).json({ error: 'OC no encontrada' });
    if (['recibida', 'cerrada', 'cancelada'].includes(po.status)) {
      return res.status(400).json({ error: `La orden ya se encuentra en estado "${po.status}"` });
    }

    const updatedNotes = reason
      ? `${po.notes || ''} [Cierre manual: ${reason}]`.trim()
      : `${po.notes || ''} [Cerrada manualmente sin recibir todo]`.trim();

    await knex('purchase_orders').where({ id }).update({
      status: 'cerrada',
      received_date: knex.fn.now(),
      notes: updatedNotes,
      updated_at: knex.fn.now()
    });

    res.json({ message: 'Orden de compra cerrada y finalizada exitosamente' });
  } catch (err) {
    console.error('Error al cerrar OC:', err);
    res.status(500).json({ error: 'Error al cerrar orden de compra: ' + err.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;

    const po = await knex('purchase_orders').where({ id, business_id: businessId }).first();
    if (!po) return res.status(404).json({ error: 'OC no encontrada' });
    if (['recibida', 'cerrada'].includes(po.status)) {
      return res.status(400).json({ error: 'No se puede cancelar una OC ya recibida o cerrada' });
    }

    await knex('purchase_orders').where({ id }).update({ status: 'cancelada', updated_at: knex.fn.now() });
    res.json({ message: 'Orden de compra cancelada' });
  } catch (err) {
    console.error('Error al cancelar OC:', err);
    res.status(500).json({ error: 'Error al cancelar orden de compra' });
  }
};
