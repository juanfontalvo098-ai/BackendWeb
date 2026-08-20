/**
 * Orders Controller — Multi-tenant
 * Órdenes filtradas por branch_id, con toda la lógica de ítems y cocina
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { status, table_id, order_type, customer_id, shift_id, cash_shift_id } = req.query;

    let query = knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .leftJoin('invoices as inv', 'o.id', 'inv.order_id')
      .leftJoin('cash_registers as cr', knex.raw('COALESCE(o.cash_register_id, inv.cash_register_id)'), 'cr.id')
      .leftJoin('accounts_receivable as ar', 'inv.id', 'ar.invoice_id')
      .select(
        'o.*',
        knex.raw('COALESCE(o.cash_register_id, inv.cash_register_id) as cash_shift_id'),
        'cr.status as shift_status',
        't.table_number',
        'u.full_name as waiter_name',
        'c.name as customer_name',
        'c.document_type as customer_doc_type',
        'c.document_number as customer_document',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.email as customer_email',
        'inv.id as invoice_id',
        'inv.invoice_number',
        'inv.total as invoice_total',
        'inv.tip_amount as invoice_tip_amount',
        'inv.tip_percentage as invoice_tip_percentage',
        'inv.payment_method as invoice_payment_method',
        'inv.created_at as invoice_created_at',
        'ar.id as credit_ar_id',
        'ar.amount as credit_amount',
        'ar.paid_amount as credit_paid_amount',
        'ar.balance as credit_balance',
        'ar.due_date as credit_due_date',
        'ar.status as credit_status'
      )
      .where('o.business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('o.branch_id', branchId);
    }

    if (status) query.andWhere('o.status', status);
    if (table_id) query.andWhere('o.table_id', table_id);
    if (order_type) query.andWhere('o.order_type', order_type);
    if (customer_id) query.andWhere('o.customer_id', customer_id);
    
    const filterShiftId = shift_id || cash_shift_id;
    if (filterShiftId) {
      query.where(knex.raw('COALESCE(o.cash_register_id, inv.cash_register_id)'), filterShiftId);
    }

    query.orderBy('o.id', 'desc');

    const orders = await query;

    // Cargar ítems y calcular totales de cada orden
    for (const order of orders) {
      order.items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name', 'p.image_url')
        .where('oi.order_id', order.id);

      let itemsTotal = 0;
      let taxTotal = 0;
      (order.items || []).forEach(it => {
        const lineTotal = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0);
        itemsTotal += lineTotal;
        const rate = parseFloat(it.tax_rate || 0);
        if (rate > 0) {
          if (it.tax_included) {
            const sub = lineTotal / (1 + rate);
            taxTotal += (lineTotal - sub);
          } else {
            taxTotal += (lineTotal * rate);
          }
        }
      });

      const disc = parseFloat(order.discount_amount || 0);
      const deliveryFee = parseFloat(order.delivery_fee || 0);
      const computedSubtotal = Math.max(0, itemsTotal - disc);
      order.items_subtotal = itemsTotal;
      order.computed_total = computedSubtotal + deliveryFee;
      order.final_total = order.invoice_total !== null && order.invoice_total !== undefined
        ? parseFloat(order.invoice_total)
        : (order.computed_total + (parseFloat(order.invoice_tip_amount) || 0));
    }

    res.json(orders);
  } catch (err) {
    console.error('Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error al obtener órdenes' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const order = await knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .leftJoin('invoices as inv', 'o.id', 'inv.order_id')
      .leftJoin('accounts_receivable as ar', 'inv.id', 'ar.invoice_id')
      .select(
        'o.*',
        't.table_number',
        'u.full_name as waiter_name',
        'c.name as customer_name',
        'c.document_type as customer_doc_type',
        'c.document_number as customer_document',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.email as customer_email',
        'inv.id as invoice_id',
        'inv.invoice_number',
        'inv.total as invoice_total',
        'inv.tip_amount as invoice_tip_amount',
        'inv.tip_percentage as invoice_tip_percentage',
        'inv.payment_method as invoice_payment_method',
        'inv.created_at as invoice_created_at',
        'ar.id as credit_ar_id',
        'ar.amount as credit_amount',
        'ar.paid_amount as credit_paid_amount',
        'ar.balance as credit_balance',
        'ar.due_date as credit_due_date',
        'ar.status as credit_status'
      )
      .where({ 'o.id': req.params.id, 'o.business_id': businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    order.items = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name', 'p.image_url')
      .where('oi.order_id', order.id);

    let itemsTotal = 0;
    (order.items || []).forEach(it => {
      itemsTotal += (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0);
    });
    const disc = parseFloat(order.discount_amount || 0);
    const deliveryFee = parseFloat(order.delivery_fee || 0);
    order.items_subtotal = itemsTotal;
    order.computed_total = Math.max(0, itemsTotal - disc) + deliveryFee;
    order.final_total = order.invoice_total !== null && order.invoice_total !== undefined
      ? parseFloat(order.invoice_total)
      : (order.computed_total + (parseFloat(order.invoice_tip_amount) || 0));

    res.json(order);
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error al obtener orden' });
  }
};

exports.create = async (req, res) => {
  const {
    table_id, guests, notes, order_type, customer_id,
    delivery_address, delivery_phone, delivery_notes,
    discount_amount, discount_type, delivery_fee,
    delivery_zone_id, delivery_driver_id
  } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  if (!branchId) return res.status(400).json({ error: 'Se requiere una sucursal activa' });

  try {
    const isMesaOrder = order_type === 'mesa' || (!order_type && table_id);

    if (isMesaOrder && table_id) {
      const table = await knex('tables_restaurant')
        .where({ id: table_id, business_id: businessId })
        .first();
      if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

      // Verificación interna silenciosa de orden activa existente en la mesa
      const existingOrder = await knex('orders')
        .where('table_id', table_id)
        .whereNotIn('status', ['cerrada', 'cancelada'])
        .orderBy('id', 'desc')
        .first();

      if (existingOrder) {
        // Si ya hay una orden activa en la mesa, adjuntar los ítems sin crear comanda duplicada
        if (Array.isArray(req.body.items) && req.body.items.length > 0) {
          const newItemsList = [];
          for (const item of req.body.items) {
            const prod = await knex('products').where({ id: item.product_id, business_id: businessId }).first();
            if (prod) {
              const [inserted] = await knex('order_items').insert({
                order_id: existingOrder.id,
                product_id: prod.id,
                quantity: parseInt(item.quantity, 10) || 1,
                unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
                tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
                tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
                status: req.body.send_to_kitchen ? 'enviado_cocina' : 'pendiente',
                notes: item.notes || null,
                sent_to_kitchen_at: req.body.send_to_kitchen ? knex.fn.now() : null
              }).returning('*');
              newItemsList.push({ name: prod.name, quantity: inserted.quantity, notes: inserted.notes });
            }
          }

          if (req.body.send_to_kitchen && newItemsList.length > 0) {
            const tableDisplay = table.table_number || `Mesa ${table_id}`;
            await knex('kitchen_tickets').insert({
              business_id: businessId,
              branch_id: branchId,
              order_id: existingOrder.id,
              table_number: tableDisplay,
              items_json: JSON.stringify(newItemsList)
            });
            await knex('orders').where('id', existingOrder.id).update({ status: 'en_preparacion' });
          }

          if (req.app && req.app.locals && req.app.locals.io) {
            req.app.locals.io.to(`branch:${branchId}`).emit('order:updated', { order_id: existingOrder.id });
            if (req.body.send_to_kitchen) {
              const tableDisplay = table.table_number || `Mesa ${table_id}`;
              req.app.locals.io.to(`branch:${branchId}`).emit('kitchen:new-ticket', {
                order_id: existingOrder.id, table_number: tableDisplay
              });
            }
          }
        }

        await knex('tables_restaurant').where({ id: table_id, business_id: businessId }).update({ status: 'ocupada' });
        return res.status(200).json({ id: existingOrder.id, message: 'Ítems incorporados a la orden activa de la mesa', order: existingOrder });
      }
    }

    const finalOrderType = order_type || (table_id ? 'mesa' : 'para_llevar');

    // Asociar al turno de caja abierto actual
    const activeShift = await knex('cash_registers')
      .where({ branch_id: branchId, status: 'abierta' })
      .orderBy('id', 'desc')
      .first();

    const [newOrder] = await knex('orders').insert({
      business_id: businessId,
      branch_id: branchId,
      table_id: table_id || null,
      cash_register_id: activeShift ? activeShift.id : null,
      user_id,
      guests: guests || 1,
      notes: notes || null,
      order_type: finalOrderType,
      customer_id: customer_id || null,
      delivery_address: delivery_address || null,
      delivery_phone: delivery_phone || null,
      delivery_notes: delivery_notes || null,
      delivery_fee: (delivery_fee !== undefined && delivery_fee !== null) ? parseFloat(delivery_fee) : 0,
      discount_amount: (discount_amount !== undefined && discount_amount !== null) ? parseFloat(discount_amount) : 0,
      discount_type: discount_type || null
    }).returning('*');

    if (table_id) {
      await knex('tables_restaurant').where({ id: table_id, business_id: businessId }).update({ status: 'ocupada' });
    }

    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      const newItemsList = [];
      for (const item of req.body.items) {
        const prod = await knex('products').where({ id: item.product_id, business_id: businessId }).first();
        if (prod) {
          const [inserted] = await knex('order_items').insert({
            order_id: newOrder.id,
            product_id: prod.id,
            quantity: parseInt(item.quantity, 10) || 1,
            unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
            tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
            tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
            status: req.body.send_to_kitchen ? 'enviado_cocina' : 'pendiente',
            notes: item.notes || null,
            sent_to_kitchen_at: req.body.send_to_kitchen ? knex.fn.now() : null
          }).returning('*');
          newItemsList.push({ name: prod.name, quantity: inserted.quantity, notes: inserted.notes });
        }
      }

      // Crear ticket de comanda para cocina si se indicó
      if (req.body.send_to_kitchen && newItemsList.length > 0) {
        const tableDisplay = table_id ? `Mesa ${table_id}` : (finalOrderType === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
        await knex('kitchen_tickets').insert({
          business_id: businessId,
          branch_id: branchId,
          order_id: newOrder.id,
          table_number: tableDisplay,
          items_json: JSON.stringify(newItemsList)
        });
        await knex('orders').where('id', newOrder.id).update({ status: 'en_preparacion' });
      }
    }

    // Si es domicilio y se pasó conductor/zona, crear asignación de delivery
    if (finalOrderType === 'delivery') {
      if (delivery_driver_id) {
        await knex('delivery_assignments').insert({
          business_id: businessId,
          order_id: newOrder.id,
          driver_user_id: parseInt(delivery_driver_id, 10),
          delivery_zone_id: delivery_zone_id ? parseInt(delivery_zone_id, 10) : null,
          status: 'asignado'
        });
      }
    }

    if (req.app && req.app.locals && req.app.locals.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('order:created', { order_id: newOrder.id });
      const tableDisplay = table_id ? `Mesa ${table_id}` : (finalOrderType === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
      req.app.locals.io.to(`branch:${branchId}`).emit('kitchen:new-ticket', {
        order_id: newOrder.id, table_number: tableDisplay
      });
    }

    res.status(201).json({ id: newOrder.id, message: 'Orden creada exitosamente', order: newOrder });
  } catch (err) {
    console.error('Error al crear orden:', err);
    res.status(500).json({ error: 'Error al crear la orden' });
  }
};

exports.addItems = async (req, res) => {
  const { id } = req.params;
  const { items } = req.body;
  const { businessId } = req.tenant;

  try {
    const order = await knex('orders')
      .where({ id, business_id: businessId })
      .first();

    if (!order || ['cerrada', 'cancelada'].includes(order.status)) {
      return res.status(400).json({ error: 'La orden no se puede modificar' });
    }

    await knex.transaction(async (trx) => {
      for (const item of items) {
        const product = await trx('products')
          .where({ id: item.product_id, business_id: businessId })
          .first();
        if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

        const priceToUse = (item.unit_price !== undefined && item.unit_price !== null && !isNaN(parseFloat(item.unit_price)))
          ? parseFloat(item.unit_price)
          : parseFloat(product.price);

        await trx('order_items').insert({
          order_id: id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: priceToUse,
          tax_rate: product.tax_rate,
          tax_included: product.tax_included,
          notes: item.notes || null
        });
      }

      await trx('orders').where('id', id).update({ updated_at: knex.fn.now() });
      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'ocupada' });
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      const branchId = order.branch_id;
      req.app.locals.io.to(`branch:${branchId}`).emit('order:updated', { order_id: id });
      if (order.table_id) {
        req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', { table_id: order.table_id, status: 'ocupada' });
      }
    }

    res.json({ message: 'Ítems agregados a la orden' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al agregar ítems' });
  }
};

exports.updateOrder = async (req, res) => {
  const { id } = req.params;
  const {
    customer_id,
    order_type,
    table_id,
    guests,
    notes,
    delivery_address,
    delivery_phone,
    delivery_notes,
    delivery_fee,
    discount_amount,
    discount_type,
    items,
    send_to_kitchen
  } = req.body;
  const { businessId } = req.tenant;

  try {
    const order = await knex('orders')
      .where({ id, business_id: businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'cerrada') return res.status(400).json({ error: 'No se puede modificar una orden que ya está cerrada y facturada' });
    if (order.status === 'cancelada') return res.status(400).json({ error: 'No se puede modificar una orden cancelada' });

    await knex.transaction(async (trx) => {
      const updateData = { updated_at: trx.fn.now() };
      if (customer_id !== undefined) updateData.customer_id = customer_id || null;
      if (order_type !== undefined) updateData.order_type = order_type;
      if (table_id !== undefined) updateData.table_id = table_id || null;
      if (guests !== undefined) updateData.guests = parseInt(guests, 10) || 1;
      if (notes !== undefined) updateData.notes = notes || null;
      if (delivery_address !== undefined) updateData.delivery_address = delivery_address || null;
      if (delivery_phone !== undefined) updateData.delivery_phone = delivery_phone || null;
      if (delivery_notes !== undefined) updateData.delivery_notes = delivery_notes || null;
      if (delivery_fee !== undefined) updateData.delivery_fee = parseFloat(delivery_fee) || 0;
      if (discount_amount !== undefined) updateData.discount_amount = parseFloat(discount_amount) || 0;
      if (discount_type !== undefined) updateData.discount_type = discount_type || null;

      await trx('orders').where('id', id).update(updateData);

      // Si se envían ítems completos
      if (Array.isArray(items)) {
        const existingItems = await trx('order_items').where('order_id', id);
        const incomingItemIds = items.filter(it => it.id).map(it => it.id);

        // 1. Eliminar ítems que ya no están
        for (const existing of existingItems) {
          if (!incomingItemIds.includes(existing.id)) {
            await trx('order_items').where('id', existing.id).del();
          }
        }

        // 2. Actualizar o insertar ítems
        const newlyAddedItems = [];
        for (const item of items) {
          if (item.id) {
            // Actualizar existente
            await trx('order_items').where('id', item.id).update({
              quantity: parseInt(item.quantity, 10) || 1,
              unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : undefined,
              notes: item.notes || null
            });
          } else if (item.product_id) {
            // Insertar nuevo ítem
            const prod = await trx('products').where('id', item.product_id).first();
            if (prod) {
              const [inserted] = await trx('order_items').insert({
                order_id: id,
                product_id: prod.id,
                quantity: parseInt(item.quantity, 10) || 1,
                unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
                tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
                tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
                status: 'pendiente',
                notes: item.notes || null
              }).returning('*');
              newlyAddedItems.push({ ...inserted, name: prod.name });
            }
          }
        }

        // Si se pidió enviar a cocina y hay nuevos ítems
        if (send_to_kitchen && newlyAddedItems.length > 0) {
          const itemsJson = newlyAddedItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes }));
          const tableDisplay = order.table_number ? `Mesa ${order.table_number}` : (order.order_type === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
          await trx('kitchen_tickets').insert({
            business_id: businessId,
            branch_id: order.branch_id,
            order_id: id,
            table_number: tableDisplay,
            items_json: JSON.stringify(itemsJson)
          });
          await trx('order_items')
            .whereIn('id', newlyAddedItems.map(i => i.id))
            .update({ status: 'enviado_cocina', sent_to_kitchen_at: trx.fn.now() });
          await trx('orders').where('id', id).update({ status: 'en_preparacion' });
        }
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('order:updated', { order_id: id });
    }

    const updatedOrder = await knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .select('o.*', 't.table_number', 'u.full_name as waiter_name', 'c.name as customer_name', 'c.document_number as customer_document', 'c.phone as customer_phone')
      .where({ 'o.id': id, 'o.business_id': businessId })
      .first();

    if (updatedOrder) {
      updatedOrder.items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name', 'p.image_url')
        .where('oi.order_id', id);
    }

    res.json({ message: 'Orden actualizada exitosamente', order: updatedOrder });
  } catch (err) {
    console.error('Error al actualizar orden:', err);
    res.status(500).json({ error: 'Error al actualizar orden', details: err.message });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const item = await knex('order_items').where('id', req.params.itemId).first();
    if (!item) return res.json({ message: 'Ítem no encontrado' });

    await knex('order_items')
      .where({ id: req.params.itemId, status: 'pendiente' })
      .del();

    const remainingCount = await knex('order_items')
      .where('order_id', item.order_id)
      .count('id as count')
      .first();

    const order = await knex('orders').where('id', item.order_id).first();

    if (parseInt(remainingCount.count) === 0 && order && order.status === 'abierta' && order.table_id) {
      await knex('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
      if (req.app && req.app.locals && req.app.locals.io) {
        req.app.locals.io.to(`branch:${order.branch_id}`).emit('table:status-changed', {
          table_id: order.table_id, status: 'libre'
        });
      }
    }

    res.json({ message: 'Ítem eliminado' });
  } catch (err) {
    console.error('Error al eliminar ítem:', err);
    res.status(500).json({ error: 'Error al eliminar ítem' });
  }
};

exports.updateItemQuantity = async (req, res) => {
  const { quantity } = req.body;
  try {
    const result = await knex('order_items')
      .where({ id: req.params.itemId, status: 'pendiente' })
      .update({ quantity });

    if (result === 0) return res.status(400).json({ error: 'No se puede modificar este ítem' });
    res.json({ message: 'Cantidad actualizada' });
  } catch (err) {
    console.error('Error al actualizar cantidad:', err);
    res.status(500).json({ error: 'Error al actualizar cantidad' });
  }
};

exports.sendToKitchen = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    const order = await knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .select('o.*', 't.table_number')
      .where({ 'o.id': id, 'o.business_id': businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const pendingItems = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where({ 'oi.order_id': id, 'oi.status': 'pendiente' });

    if (pendingItems.length === 0) {
      return res.status(400).json({ error: 'No hay ítems nuevos pendientes para enviar a cocina' });
    }

    const itemsJson = pendingItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes }));
    const tableDisplay = order.table_number ? `Mesa ${order.table_number}` : (order.order_type === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');

    await knex.transaction(async (trx) => {
      await trx('kitchen_tickets').insert({
        business_id: businessId,
        branch_id: order.branch_id,
        order_id: id,
        table_number: tableDisplay,
        items_json: JSON.stringify(itemsJson)
      });

      await trx('order_items')
        .where({ order_id: id, status: 'pendiente' })
        .update({ status: 'enviado_cocina', sent_to_kitchen_at: knex.fn.now() });

      await trx('orders').where('id', id).update({ status: 'en_preparacion', updated_at: knex.fn.now() });
      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'ocupada' });
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      const branchId = order.branch_id;
      req.app.locals.io.to(`branch:${branchId}`).emit('kitchen:new-ticket', {
        order_id: id, 
        table_number: tableDisplay,
        items: itemsJson,
        order_type: order.order_type,
        created_at: new Date().toISOString()
      });
      if (order.table_id) {
        req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
          table_id: order.table_id, status: 'ocupada'
        });
      }
      req.app.locals.io.to(`branch:${branchId}`).emit('order:updated', { order_id: id });
    }

    res.json({ message: 'Comanda enviada a cocina exitosamente' });
  } catch (err) {
    console.error('Error al enviar a cocina:', err);
    res.status(500).json({ error: 'Error al enviar a cocina', details: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const { businessId } = req.tenant;

  try {
    const order = await knex('orders')
      .where({ id, business_id: businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'cerrada') return res.status(400).json({ error: 'La orden ya está cerrada y facturada' });

    await knex.transaction(async (trx) => {
      await trx('orders').where('id', id).update({
        status: 'cancelada',
        notes: reason ? `Cancelada: ${reason}` : 'Anulada por el usuario',
        updated_at: knex.fn.now()
      });
      await trx('order_items').where('order_id', id).del();
      await trx('kitchen_tickets').where('order_id', id).del();
      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      if (order.table_id) {
        req.app.locals.io.to(`branch:${order.branch_id}`).emit('table:status-changed', {
          table_id: order.table_id, status: 'libre'
        });
      }
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('order:updated', { order_id: id });
    }

    res.json({ message: 'Orden cancelada / anulada exitosamente' });
  } catch (err) {
    console.error('Error al cancelar la orden:', err);
    res.status(500).json({ error: 'Error al cancelar la orden' });
  }
};

exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  try {
    await knex('orders').where('id', id).update({
      status,
      updated_at: knex.fn.now()
    });

    const order = await knex('orders').where('id', id).first();

    if (req.app.locals.io && order) {
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('order:updated', { order_id: id });

      if (status === 'lista') {
        const orderData = await knex('orders as o')
          .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
          .select('o.id', 'o.order_type', 't.table_number')
          .where('o.id', id)
          .first();

        const items = await knex('order_items as oi')
          .join('products as p', 'oi.product_id', 'p.id')
          .select('p.name', 'oi.quantity')
          .where('oi.order_id', id);

        const summary = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
        const tableLabel = orderData?.table_number ? `Mesa ${orderData.table_number}` : (orderData?.order_type || `#${id}`);

        req.app.locals.io.to(`branch:${order.branch_id}`).emit('kitchen:ticket-ready', {
          orderId: id,
          table_number: tableLabel,
          summary
        });
      }
    }

    res.json({ message: 'Estado de la orden actualizado' });
  } catch (err) {
    console.error('Error al actualizar estado de la orden:', err);
    res.status(500).json({ error: 'Error al actualizar estado de la orden' });
  }
};

exports.updateItemStatus = async (req, res) => {
  const { status } = req.body;
  const { itemId } = req.params;
  try {
    await knex('order_items').where('id', itemId).update({ status });
    res.json({ message: 'Estado de ítem de orden actualizado' });
  } catch (err) {
    console.error('Error al actualizar estado del ítem:', err);
    res.status(500).json({ error: 'Error al actualizar estado del ítem' });
  }
};

exports.cleanupEmptyOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    const order = await knex('orders')
      .where({ id, business_id: businessId, status: 'abierta' })
      .first();

    if (order) {
      const itemsCount = await knex('order_items')
        .where('order_id', id)
        .count('id as count')
        .first();

      if (parseInt(itemsCount.count) === 0) {
        await knex('orders').where({ id }).del();
        return res.json({ message: 'Orden vacía eliminada' });
      }
    }

    res.json({ message: 'No se requería limpieza' });
  } catch (err) {
    console.error('Error al limpiar orden vacía:', err);
    res.status(500).json({ error: 'Error al limpiar orden' });
  }
};

