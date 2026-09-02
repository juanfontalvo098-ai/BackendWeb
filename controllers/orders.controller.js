/**
 * Orders Controller — Multi-tenant
 * Órdenes filtradas por branch_id, con toda la lógica de ítems y cocina
 */
const knex = require('../database/knex');

function emitToBranchAndBusiness(io, branchId, businessId, event, data) {
  if (!io) return;
  try {
    if (branchId) {
      io.to(`branch:${branchId}`).emit(event, data);
      io.to(`kitchen:${branchId}`).emit(event, data);
      io.to(`service:${branchId}`).emit(event, data);
    }
    if (businessId) {
      io.to(`business:${businessId}`).emit(event, data);
    }
    // Emisión global para asegurar recepción en terminales de impresión y estaciones
    io.emit(event, data);
  } catch (e) {
    console.warn(`[SocketIO] Error emit ${event}:`, e.message);
  }
}

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
        'inv.third_party_total as invoice_third_party_total',
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
        .select('oi.*', 'p.name', 'p.image_url', 'p.is_third_party as product_is_third_party')
        .where('oi.order_id', order.id);

      let itemsTotal = 0;
      let taxTotal = 0;
      let thirdPartyTotal = 0;
      (order.items || []).forEach(it => {
        const lineTotal = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0);
        itemsTotal += lineTotal;
        if (it.is_third_party || it.product_is_third_party) {
          thirdPartyTotal += lineTotal;
        }
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
      order.third_party_total = order.invoice_third_party_total !== null && order.invoice_third_party_total !== undefined
        ? parseFloat(order.invoice_third_party_total)
        : thirdPartyTotal;
      order.computed_total = computedSubtotal + deliveryFee;
      order.final_total = order.invoice_total !== null && order.invoice_total !== undefined
        ? parseFloat(order.invoice_total)
        : (order.computed_total + (parseFloat(order.invoice_tip_amount) || 0));
      order.own_final_total = Math.max(0, order.final_total - (order.third_party_total || 0));
      order.own_computed_total = Math.max(0, order.computed_total - (order.third_party_total || 0));
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
        'inv.third_party_total as invoice_third_party_total',
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
      .select('oi.*', 'p.name', 'p.image_url', 'p.is_third_party as product_is_third_party')
      .where('oi.order_id', order.id);

    let itemsTotal = 0;
    let thirdPartyTotal = 0;
    (order.items || []).forEach(it => {
      const lineTotal = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0);
      itemsTotal += lineTotal;
      if (it.is_third_party || it.product_is_third_party) {
        thirdPartyTotal += lineTotal;
      }
    });
    const disc = parseFloat(order.discount_amount || 0);
    const deliveryFee = parseFloat(order.delivery_fee || 0);
    order.items_subtotal = itemsTotal;
    order.third_party_total = order.invoice_third_party_total !== null && order.invoice_third_party_total !== undefined
      ? parseFloat(order.invoice_third_party_total)
      : thirdPartyTotal;
    order.computed_total = Math.max(0, itemsTotal - disc) + deliveryFee;
    order.final_total = order.invoice_total !== null && order.invoice_total !== undefined
      ? parseFloat(order.invoice_total)
      : (order.computed_total + (parseFloat(order.invoice_tip_amount) || 0));
    order.own_final_total = Math.max(0, order.final_total - (order.third_party_total || 0));
    order.own_computed_total = Math.max(0, order.computed_total - (order.third_party_total || 0));

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
    let finalOrder = null;
    let itemsForKitchen = [];
    let isNewOrder = false;
    let finalOrderType = order_type || (table_id ? 'mesa' : 'para_llevar');
    let resolvedTableDisplay = '';

    await knex.transaction(async (trx) => {
      const isMesaOrder = order_type === 'mesa' || (!order_type && table_id);

      if (isMesaOrder && table_id) {
        const table = await trx('tables_restaurant')
          .where({ id: table_id, business_id: businessId })
          .first();
        if (!table) throw new Error('Mesa no encontrada');

        resolvedTableDisplay = table.table_number ? (table.table_number.toLowerCase().startsWith('mesa') ? table.table_number : `Mesa ${table.table_number}`) : `Mesa ${table_id}`;

        // Verificación interna silenciosa de orden activa existente en la mesa
        const existingOrder = await trx('orders')
          .where('table_id', table_id)
          .whereNotIn('status', ['cerrada', 'cancelada'])
          .orderBy('id', 'desc')
          .first();

        if (existingOrder) {
          finalOrder = existingOrder;
          if (Array.isArray(req.body.items) && req.body.items.length > 0) {
            for (const item of req.body.items) {
              const prod = await trx('products').where({ id: item.product_id, business_id: businessId }).first();
              if (prod) {
                const modifiersVal = item.modifiers_json || item.modifiers;
                const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

                const [inserted] = await trx('order_items').insert({
                  order_id: existingOrder.id,
                  product_id: prod.id,
                  quantity: parseInt(item.quantity, 10) || 1,
                  unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
                  tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
                  tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
                  is_third_party: Boolean(prod.is_third_party),
                  status: req.body.send_to_kitchen ? 'enviado_cocina' : 'pendiente',
                  notes: item.notes || null,
                  modifiers_json: modifiersJson,
                  sent_to_kitchen_at: req.body.send_to_kitchen ? trx.fn.now() : null
                }).returning('*');

                let modsText = '';
                if (modifiersJson) {
                  try {
                    const parsed = JSON.parse(modifiersJson);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
                    }
                  } catch (e) {}
                }

                itemsForKitchen.push({
                  name: prod.name,
                  quantity: inserted ? inserted.quantity : (parseInt(item.quantity, 10) || 1),
                  notes: item.notes || null,
                  modifiers: modsText || undefined,
                  modifiers_json: modifiersJson
                });
              }
            }

            if (req.body.send_to_kitchen && itemsForKitchen.length > 0) {
              await trx('kitchen_tickets').insert({
                business_id: businessId,
                branch_id: branchId,
                order_id: existingOrder.id,
                table_number: resolvedTableDisplay,
                items_json: JSON.stringify(itemsForKitchen)
              });
              await trx('orders').where('id', existingOrder.id).update({ status: 'en_preparacion', updated_at: trx.fn.now() });
            }
          }

          await trx('tables_restaurant').where({ id: table_id, business_id: businessId }).update({ status: 'ocupada' });
          return;
        }
      }

      // Si no hay orden existente en la mesa o es para llevar / delivery:
      isNewOrder = true;
      if (!resolvedTableDisplay) {
        resolvedTableDisplay = table_id ? `Mesa ${table_id}` : (finalOrderType === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
      }

      // Asociar al turno de caja abierto actual
      const activeShift = await trx('cash_registers')
        .where({ branch_id: branchId, status: 'abierta' })
        .orderBy('id', 'desc')
        .first();

      const [newOrder] = await trx('orders').insert({
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

      finalOrder = newOrder;

      if (table_id) {
        await trx('tables_restaurant').where({ id: table_id, business_id: businessId }).update({ status: 'ocupada' });
      }

      if (Array.isArray(req.body.items) && req.body.items.length > 0) {
        for (const item of req.body.items) {
          const prod = await trx('products').where({ id: item.product_id, business_id: businessId }).first();
          if (prod) {
            const modifiersVal = item.modifiers_json || item.modifiers;
            const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

            const [inserted] = await trx('order_items').insert({
              order_id: newOrder.id,
              product_id: prod.id,
              quantity: parseInt(item.quantity, 10) || 1,
              unit_price: item.unit_price !== undefined ? Math.max(parseFloat(prod.price), parseFloat(item.unit_price)) : parseFloat(prod.price),
              tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
              tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
              is_third_party: Boolean(prod.is_third_party),
              status: req.body.send_to_kitchen ? 'enviado_cocina' : 'pendiente',
              notes: item.notes || null,
              modifiers_json: modifiersJson,
              sent_to_kitchen_at: req.body.send_to_kitchen ? trx.fn.now() : null
            }).returning('*');

            let modsText = '';
            if (modifiersJson) {
              try {
                const parsed = JSON.parse(modifiersJson);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
                }
              } catch (e) {}
            }

            itemsForKitchen.push({
              name: prod.name,
              quantity: inserted ? inserted.quantity : (parseInt(item.quantity, 10) || 1),
              notes: item.notes || null,
              modifiers: modsText || undefined,
              modifiers_json: modifiersJson
            });
          }
        }

        // Crear ticket de comanda para cocina si se indicó
        if (req.body.send_to_kitchen && itemsForKitchen.length > 0) {
          await trx('kitchen_tickets').insert({
            business_id: businessId,
            branch_id: branchId,
            order_id: newOrder.id,
            table_number: resolvedTableDisplay,
            items_json: JSON.stringify(itemsForKitchen)
          });
          await trx('orders').where('id', newOrder.id).update({ status: 'en_preparacion' });
        }
      }

      // Si es domicilio y se pasó conductor/zona, crear asignación de delivery
      if (finalOrderType === 'delivery') {
        if (delivery_driver_id) {
          await trx('delivery_assignments').insert({
            order_id: newOrder.id,
            driver_user_id: parseInt(delivery_driver_id, 10),
            delivery_zone_id: delivery_zone_id ? parseInt(delivery_zone_id, 10) : null,
            status: 'asignado'
          });
        }
      }
    });

    // Emisión segura de Socket.IO tras el commit de la transacción
    if (req.app && req.app.locals && req.app.locals.io && finalOrder) {
      try {
        const io = req.app.locals.io;
        if (isNewOrder) {
          emitToBranchAndBusiness(io, branchId, businessId, 'order:created', { order_id: finalOrder.id });
          if (finalOrderType === 'delivery') {
            emitToBranchAndBusiness(io, branchId, businessId, 'delivery:status-changed', { order_id: finalOrder.id });
            if (delivery_driver_id) {
              emitToBranchAndBusiness(io, branchId, businessId, 'delivery:assigned', { order_id: finalOrder.id, driver_user_id: delivery_driver_id });
            }
          }
        } else {
          emitToBranchAndBusiness(io, branchId, businessId, 'order:updated', { order_id: finalOrder.id });
        }

        if (table_id) {
          emitToBranchAndBusiness(io, branchId, businessId, 'table:status-changed', { table_id, status: 'ocupada' });
        }

        if (req.body.send_to_kitchen && itemsForKitchen.length > 0) {
          const ticketPayload = {
            order_id: finalOrder.id,
            business_id: businessId,
            branch_id: branchId,
            table_number: resolvedTableDisplay,
            items: itemsForKitchen,
            notes: notes || finalOrder.notes || '',
            waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
            order_type: finalOrderType,
            created_at: new Date().toISOString()
          };
          emitToBranchAndBusiness(io, branchId, businessId, 'kitchen:new-ticket', ticketPayload);
        }
      } catch (socketErr) {
        console.warn('[SocketIO] Error al emitir eventos de orden:', socketErr.message);
      }
    }

    const statusCode = isNewOrder ? 201 : 200;
    const msg = isNewOrder ? 'Orden creada exitosamente' : 'Ítems incorporados a la orden activa de la mesa';
    return res.status(statusCode).json({ id: finalOrder.id, message: msg, order: finalOrder });
  } catch (err) {
    console.error('Error al crear orden:', err);
    return res.status(500).json({ error: err.message || 'Error al crear la orden' });
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

        const modifiersVal = item.modifiers_json || item.modifiers;
        const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

        await trx('order_items').insert({
          order_id: id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: priceToUse,
          tax_rate: product.tax_rate,
          tax_included: product.tax_included,
          is_third_party: Boolean(product.is_third_party),
          notes: item.notes || null,
          modifiers_json: modifiersJson
        });
      }

      await trx('orders').where('id', id).update({ updated_at: knex.fn.now() });
      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'ocupada' });
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      const branchId = order.branch_id;
      emitToBranchAndBusiness(req.app.locals.io, branchId, businessId, 'order:updated', { order_id: id });
      if (order.table_id) {
        emitToBranchAndBusiness(req.app.locals.io, branchId, businessId, 'table:status-changed', { table_id: order.table_id, status: 'ocupada' });
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

    let newlyAddedItems = [];
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
        for (const item of items) {
          if (item.id) {
            // Actualizar existente
            const updateItemObj = {
              quantity: parseInt(item.quantity, 10) || 1,
              unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : undefined,
              notes: item.notes || null
            };
            if (item.modifiers_json !== undefined || item.modifiers !== undefined) {
              const modifiersVal = item.modifiers_json !== undefined ? item.modifiers_json : item.modifiers;
              updateItemObj.modifiers_json = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;
            }
            await trx('order_items').where('id', item.id).update(updateItemObj);
          } else if (item.product_id) {
            // Insertar nuevo ítem
            const prod = await trx('products').where('id', item.product_id).first();
            if (prod) {
              const modifiersVal = item.modifiers_json || item.modifiers;
              const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

              const [inserted] = await trx('order_items').insert({
                order_id: id,
                product_id: prod.id,
                quantity: parseInt(item.quantity, 10) || 1,
                unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
                tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
                tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
                status: 'pendiente',
                notes: item.notes || null,
                modifiers_json: modifiersJson
              }).returning('*');

              let modsText = '';
              if (modifiersJson) {
                try {
                  const parsed = JSON.parse(modifiersJson);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
                  }
                } catch (e) {}
              }

              newlyAddedItems.push({
                ...inserted,
                name: prod.name,
                modifiers: modsText || undefined
              });
            }
          }
        }

        // Si se pidió enviar a cocina y hay nuevos ítems
        if (send_to_kitchen && newlyAddedItems.length > 0) {
          const itemsJson = newlyAddedItems.map(i => ({
            name: i.name,
            quantity: i.quantity,
            notes: i.notes,
            modifiers: i.modifiers
          }));
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

      // Garantizar que la mesa quede marcada como 'ocupada' si la orden tiene mesa y tiene ítems
      const resolvedTableId = table_id !== undefined ? table_id : order.table_id;
      if (resolvedTableId) {
        const finalItemsCount = await trx('order_items').where('order_id', id).count('id as count').first();
        if (parseInt(finalItemsCount.count) > 0) {
          await trx('tables_restaurant').where({ id: resolvedTableId, business_id: businessId }).update({ status: 'ocupada' });
        }
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      const io = req.app.locals.io;
      emitToBranchAndBusiness(io, order.branch_id, businessId, 'order:updated', { order_id: id });

      // Emitir cambio de estado de mesa para que TablesPage se actualice
      const resolvedTableId = table_id !== undefined ? table_id : order.table_id;
      if (resolvedTableId) {
        emitToBranchAndBusiness(io, order.branch_id, businessId, 'table:status-changed', { table_id: resolvedTableId, status: 'ocupada' });
      }

      if (send_to_kitchen && newlyAddedItems.length > 0) {
        const tableDisplay = order.table_number ? `Mesa ${order.table_number}` : (order.order_type === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
        const itemsJson = newlyAddedItems.map(i => ({
          name: i.name,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: i.modifiers
        }));
        const ticketPayload = {
          order_id: id,
          business_id: businessId,
          branch_id: order.branch_id,
          table_number: tableDisplay,
          items: itemsJson,
          notes: order.notes || '',
          waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
          order_type: order.order_type,
          created_at: new Date().toISOString()
        };
        emitToBranchAndBusiness(io, order.branch_id, businessId, 'kitchen:new-ticket', ticketPayload);
      }
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
    res.status(500).json({ error: 'Error al actualizar la orden: ' + err.message });
  }
};

exports.removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { businessId } = req.tenant;

  try {
    const item = await knex('order_items as oi')
      .join('orders as o', 'oi.order_id', 'o.id')
      .where({ 'oi.id': itemId, 'o.id': id, 'o.business_id': businessId })
      .select('oi.*', 'o.branch_id', 'o.table_id')
      .first();

    if (!item) {
      return res.status(404).json({ error: 'Ítem no encontrado en esta orden' });
    }

    await knex('order_items').where('id', itemId).del();
    await knex('orders').where('id', id).update({ updated_at: knex.fn.now() });

    // Verificar si quedan ítems
    const remainingItems = await knex('order_items').where('order_id', id);
    if (remainingItems.length === 0) {
      if (item.table_id) {
        await knex('tables_restaurant').where('id', item.table_id).update({ status: 'libre' });
        if (req.app && req.app.locals && req.app.locals.io) {
          emitToBranchAndBusiness(req.app.locals.io, item.branch_id, businessId, 'table:status-changed', {
            table_id: item.table_id, status: 'libre'
          });
        }
      }
    }

    if (req.app && req.app.locals && req.app.locals.io) {
      emitToBranchAndBusiness(req.app.locals.io, item.branch_id, businessId, 'order:updated', { order_id: item.order_id });
    }

    res.json({ message: 'Ítem eliminado de la orden' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al eliminar ítem' });
  }
};

exports.updateItemQuantity = async (req, res) => {
  const { id, itemId } = req.params;
  const { quantity } = req.body;
  const { businessId } = req.tenant;

  try {
    const item = await knex('order_items as oi')
      .join('orders as o', 'oi.order_id', 'o.id')
      .where({ 'oi.id': itemId, 'o.id': id, 'o.business_id': businessId })
      .select('oi.*', 'o.branch_id')
      .first();

    if (!item) {
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }

    await knex('order_items').where('id', itemId).update({ quantity: qty });
    await knex('orders').where('id', id).update({ updated_at: knex.fn.now() });

    if (req.app && req.app.locals && req.app.locals.io) {
      emitToBranchAndBusiness(req.app.locals.io, item.branch_id, businessId, 'order:updated', { order_id: item.order_id });
    }

    res.json({ message: 'Cantidad actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al actualizar cantidad' });
  }
};

exports.updateItemPrice = async (req, res) => {
  const { id, itemId } = req.params;
  const { unit_price } = req.body;
  const { businessId } = req.tenant;

  try {
    const item = await knex('order_items as oi')
      .join('orders as o', 'oi.order_id', 'o.id')
      .where({ 'oi.id': itemId, 'o.id': id, 'o.business_id': businessId })
      .select('oi.*', 'o.branch_id')
      .first();

    if (!item) {
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    const price = parseFloat(unit_price);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Precio unitario inválido' });
    }

    // Validar que solo se pueda modificar a un precio superior o igual al precio de catálogo
    const prod = await knex('products').where({ id: item.product_id, business_id: businessId }).first();
    if (prod && price < parseFloat(prod.price)) {
      return res.status(400).json({
        error: `Solo se permite modificar el precio hacia arriba. El precio base de catálogo es $${parseFloat(prod.price).toLocaleString('es-CO')}`
      });
    }

    await knex('order_items').where('id', itemId).update({ unit_price: price });
    await knex('orders').where('id', id).update({ updated_at: knex.fn.now() });

    if (req.app && req.app.locals && req.app.locals.io) {
      emitToBranchAndBusiness(req.app.locals.io, item.branch_id, businessId, 'order:updated', { order_id: item.order_id });
    }

    res.json({ message: 'Precio actualizado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al actualizar precio' });
  }
};

exports.updateItemNotes = async (req, res) => {
  const { id, itemId } = req.params;
  const { notes } = req.body;
  const { businessId } = req.tenant;

  try {
    const item = await knex('order_items as oi')
      .join('orders as o', 'oi.order_id', 'o.id')
      .where({ 'oi.id': itemId, 'o.id': id, 'o.business_id': businessId })
      .select('oi.*', 'o.branch_id')
      .first();

    if (!item) {
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    await knex('order_items').where('id', itemId).update({ notes: notes || null });
    await knex('orders').where('id', id).update({ updated_at: knex.fn.now() });

    if (req.app && req.app.locals && req.app.locals.io) {
      emitToBranchAndBusiness(req.app.locals.io, item.branch_id, businessId, 'order:updated', { order_id: item.order_id });
    }

    res.json({ message: 'Notas actualizadas exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al actualizar notas' });
  }
};

exports.sendToKitchen = async (req, res) => {
  const { id } = req.params;
  const { businessId, branchId } = req.tenant;

  try {
    const order = await knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .where({ 'o.id': id, 'o.business_id': businessId })
      .select('o.*', 't.table_number')
      .first();

    if (!order) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

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
      const io = req.app.locals.io;
      const ticketPayload = {
        order_id: id, 
        business_id: businessId,
        branch_id: order.branch_id,
        table_number: tableDisplay,
        items: itemsJson,
        notes: order.notes || '',
        waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
        order_type: order.order_type,
        created_at: new Date().toISOString()
      };
      emitToBranchAndBusiness(io, order.branch_id, businessId, 'kitchen:new-ticket', ticketPayload);

      if (order.table_id) {
        emitToBranchAndBusiness(io, order.branch_id, businessId, 'table:status-changed', {
          table_id: order.table_id, status: 'ocupada'
        });
      }
      emitToBranchAndBusiness(io, order.branch_id, businessId, 'order:updated', { order_id: id });
    }

    res.json({ message: 'Comanda enviada a cocina exitosamente' });
  } catch (err) {
    console.error('Error al enviar a cocina:', err);
    res.status(500).json({ error: 'Error al enviar a cocina', details: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  const { id } = req.params;
  const { reason, restore_stock = true } = req.body || {};
  const { businessId } = req.tenant;
  const userId = req.user?.id;

  try {
    const order = await knex('orders')
      .where({ id, business_id: businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    // Buscar si tiene factura emitida
    const invoice = await knex('invoices')
      .where({ order_id: id, business_id: businessId })
      .first();

    await knex.transaction(async (trx) => {
      // 1. Si tenía factura, revertir movimientos de caja y cuentas por cobrar
      if (invoice) {
        await trx('cash_movements')
          .where('cash_register_id', invoice.cash_register_id)
          .andWhere('description', 'like', `%Factura ${invoice.invoice_number}%`)
          .del();

        await trx('accounts_receivable')
          .where({ invoice_id: invoice.id })
          .del();

        try {
          await trx('electronic_invoices').where({ invoice_id: invoice.id }).del();
        } catch (e) {}

        // Restaurar inventario si se solicita
        if (restore_stock) {
          const orderItems = await trx('order_items').where('order_id', order.id);
          for (const item of orderItems) {
            const prod = await trx('products').where('id', item.product_id).first();
            if (prod && prod.track_inventory) {
              const inv = await trx('inventory')
                .where({ product_id: item.product_id, branch_id: order.branch_id })
                .first();
              if (inv) {
                const prevQty = parseFloat(inv.quantity || 0);
                const restoreQty = parseFloat(item.quantity || 1);
                const newQty = prevQty + restoreQty;
                await trx('inventory').where('id', inv.id).update({
                  quantity: newQty,
                  updated_at: knex.fn.now()
                });
                await trx('inventory_movements').insert({
                  business_id: businessId,
                  branch_id: order.branch_id,
                  product_id: item.product_id,
                  inventory_id: inv.id,
                  user_id: userId,
                  movement_type: 'devolucion',
                  quantity: restoreQty,
                  previous_stock: prevQty,
                  new_stock: newQty,
                  unit_cost: parseFloat(prod.cost_price || 0),
                  total_cost: restoreQty * parseFloat(prod.cost_price || 0),
                  reference_id: invoice.id,
                  reference_type: 'anulacion_factura',
                  notes: `Reversión por anulación de Orden #${order.id}`
                });
              }
            }
          }
        }

        // Eliminar factura
        await trx('invoices').where('id', invoice.id).del();
      }

      // 2. Actualizar estado de la orden a 'cancelada' (manteniendo los ítems para auditoría)
      await trx('orders').where('id', id).update({
        status: 'cancelada',
        notes: reason ? `Cancelada: ${reason}` : (invoice ? `Factura #${invoice.invoice_number} Anulada` : 'Anulada por el usuario'),
        updated_at: knex.fn.now()
      });

      // 3. Liberar la mesa si aplica
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

    res.json({ message: invoice ? `Factura #${invoice.invoice_number} y orden anuladas exitosamente` : 'Orden cancelada exitosamente' });
  } catch (err) {
    console.error('Error al cancelar la orden:', err);
    res.status(500).json({ error: 'Error al cancelar la orden: ' + err.message });
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

exports.getKitchenQueue = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    let query = knex('kitchen_tickets as kt')
      .leftJoin('orders as o', 'kt.order_id', 'o.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .select(
        'kt.*',
        'o.order_type',
        'o.delivery_address',
        'o.delivery_phone',
        'o.notes as order_notes',
        'u.full_name as waiter_name',
        'c.name as customer_name'
      )
      .where('kt.business_id', businessId)
      .where('kt.created_at', '>=', knex.raw("NOW() - INTERVAL '30 minutes'"))
      .orderBy('kt.id', 'desc')
      .limit(40);

    if (branchId && !isGlobalScope) {
      query.andWhere('kt.branch_id', branchId);
    }

    const tickets = await query;
    res.json(tickets || []);
  } catch (err) {
    console.error('Error al consultar cola de cocina:', err);
    res.status(500).json({ error: 'Error al consultar cola de cocina', details: err.message });
  }
};

