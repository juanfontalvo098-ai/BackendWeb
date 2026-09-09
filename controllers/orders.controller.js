/**
 * Orders Controller — Multi-tenant
 * Órdenes filtradas por branch_id, con toda la lógica de ítems y cocina
 */
const knex = require('../database/knex');
const { restoreStockForInvoice } = require('./inventory.controller');

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
    let createdTicket = null;

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
              // Si el producto ya tiene id, ya existe en order_items; omitir para evitar duplicados
              if (item.id) continue;

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
              const [newTicket] = await trx('kitchen_tickets').insert({
                business_id: businessId,
                branch_id: branchId,
                order_id: existingOrder.id,
                table_number: resolvedTableDisplay,
                status: 'pendiente',
                items_json: JSON.stringify(itemsForKitchen)
              }).returning('*');
              createdTicket = newTicket;
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
          const [newTicket] = await trx('kitchen_tickets').insert({
            business_id: businessId,
            branch_id: branchId,
            order_id: newOrder.id,
            table_number: resolvedTableDisplay,
            status: 'pendiente',
            items_json: JSON.stringify(itemsForKitchen)
          }).returning('*');
          createdTicket = newTicket;
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
            id: createdTicket ? createdTicket.id : undefined,
            order_id: finalOrder.id,
            business_id: businessId,
            branch_id: branchId,
            table_number: resolvedTableDisplay,
            table_id: table_id || finalOrder.table_id,
            items: itemsForKitchen,
            notes: notes || finalOrder.notes || '',
            waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
            order_type: finalOrderType,
            created_at: createdTicket ? createdTicket.created_at : new Date().toISOString()
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
    const order = await knex('orders as o')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .where({ 'o.id': id, 'o.business_id': businessId })
      .select('o.*', 't.table_number as db_table_number')
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'cerrada') return res.status(400).json({ error: 'No se puede modificar una orden que ya está cerrada y facturada' });
    if (order.status === 'cancelada') return res.status(400).json({ error: 'No se puede modificar una orden cancelada' });

    let createdTicket = null;
    let kitchenItemsToSend = [];
    const effectiveTableId = table_id !== undefined ? (table_id ? parseInt(table_id, 10) : null) : order.table_id;
    let resolvedTableDisplay = '';

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
            // Insertar nuevo ítem (queda en status pendiente)
            const prod = await trx('products').where({ id: item.product_id }).first();
            if (prod) {
              const modifiersVal = item.modifiers_json || item.modifiers;
              const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

              await trx('order_items').insert({
                order_id: id,
                product_id: prod.id,
                quantity: parseInt(item.quantity, 10) || 1,
                unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(prod.price),
                tax_rate: prod.tax_rate !== undefined ? prod.tax_rate : 0.00,
                tax_included: prod.tax_included !== undefined ? prod.tax_included : true,
                is_third_party: Boolean(prod.is_third_party),
                status: 'pendiente',
                notes: item.notes || null,
                modifiers_json: modifiersJson
              });
            }
          }
        }

        // 3. Si se pidió enviar a cocina:
        // Seleccionar TODOS los ítems con status 'pendiente' de esta orden
        if (send_to_kitchen) {
          const pendingOrderItems = await trx('order_items as oi')
            .join('products as p', 'oi.product_id', 'p.id')
            .where('oi.order_id', id)
            .andWhere('oi.status', 'pendiente')
            .select('oi.*', 'p.name');

          if (pendingOrderItems.length > 0) {
            kitchenItemsToSend = pendingOrderItems.map(i => {
              let modsText = '';
              if (i.modifiers_json) {
                try {
                  const parsed = typeof i.modifiers_json === 'string' ? JSON.parse(i.modifiers_json) : i.modifiers_json;
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
                  }
                } catch (e) {}
              }
              return {
                name: i.name,
                quantity: i.quantity,
                notes: i.notes || null,
                modifiers: modsText || undefined,
                modifiers_json: i.modifiers_json
              };
            });

            let resolvedTableNumber = req.body.table_number || order.db_table_number;
            if (effectiveTableId && (!resolvedTableNumber || table_id !== undefined)) {
              const tableRec = await trx('tables_restaurant')
                .where({ id: effectiveTableId, business_id: businessId })
                .first();
              if (tableRec && tableRec.table_number) {
                resolvedTableNumber = tableRec.table_number;
              }
            }

            if (resolvedTableNumber) {
              const cleanNum = resolvedTableNumber.toString().replace(/^mesa\s*/i, '').trim();
              resolvedTableDisplay = `Mesa ${cleanNum}`;
            } else if (effectiveTableId) {
              resolvedTableDisplay = `Mesa ${effectiveTableId}`;
            } else {
              const effType = order_type || order.order_type;
              resolvedTableDisplay = effType === 'delivery' ? 'DOMICILIO' : 'PARA LLEVAR';
            }

            const [insertedTicket] = await trx('kitchen_tickets').insert({
              business_id: businessId,
              branch_id: order.branch_id,
              order_id: id,
              table_number: resolvedTableDisplay,
              status: 'pendiente',
              items_json: JSON.stringify(kitchenItemsToSend)
            }).returning('*');
            createdTicket = insertedTicket;

            await trx('order_items')
              .whereIn('id', pendingOrderItems.map(i => i.id))
              .update({ status: 'enviado_cocina', sent_to_kitchen_at: trx.fn.now() });

            await trx('orders').where('id', id).update({ status: 'en_preparacion' });
          }
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

      if (send_to_kitchen && kitchenItemsToSend.length > 0) {
        const ticketTableDisplay = createdTicket?.table_number || resolvedTableDisplay || (effectiveTableId ? `Mesa ${effectiveTableId}` : 'PARA LLEVAR');
        const ticketPayload = {
          id: createdTicket ? createdTicket.id : undefined,
          order_id: id,
          business_id: businessId,
          branch_id: order.branch_id,
          table_number: ticketTableDisplay,
          table_id: effectiveTableId,
          items: kitchenItemsToSend,
          notes: notes || order.notes || '',
          waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
          order_type: effectiveTableId ? 'mesa' : (order_type || order.order_type),
          created_at: createdTicket ? createdTicket.created_at : new Date().toISOString()
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

    const itemsJson = pendingItems.map(i => {
      let modsText = '';
      if (i.modifiers_json) {
        try {
          const parsed = typeof i.modifiers_json === 'string' ? JSON.parse(i.modifiers_json) : i.modifiers_json;
          if (Array.isArray(parsed) && parsed.length > 0) {
            modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
          }
        } catch (e) {}
      }
      return {
        name: i.name,
        quantity: i.quantity,
        notes: i.notes || null,
        modifiers: modsText || undefined,
        modifiers_json: i.modifiers_json
      };
    });
    let tableDisplay = '';
    if (order.table_number) {
      const cleanNum = order.table_number.toString().replace(/^mesa\s*/i, '').trim();
      tableDisplay = `Mesa ${cleanNum}`;
    } else if (order.table_id) {
      tableDisplay = `Mesa ${order.table_id}`;
    } else {
      tableDisplay = order.order_type === 'delivery' ? 'DOMICILIO' : 'PARA LLEVAR';
    }

    let newTicket = null;
    await knex.transaction(async (trx) => {
      const [ticket] = await trx('kitchen_tickets').insert({
        business_id: businessId,
        branch_id: order.branch_id,
        order_id: id,
        table_number: tableDisplay,
        status: 'pendiente',
        items_json: JSON.stringify(itemsJson)
      }).returning('*');
      newTicket = ticket;

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
        id: newTicket ? newTicket.id : undefined,
        order_id: id, 
        business_id: businessId,
        branch_id: order.branch_id,
        table_number: tableDisplay,
        table_id: order.table_id,
        items: itemsJson,
        notes: order.notes || '',
        waiter_name: (req.user && (req.user.full_name || req.user.name || req.user.username)) || 'Personal',
        order_type: order.table_id ? 'mesa' : order.order_type,
        created_at: newTicket?.created_at || new Date().toISOString()
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

    const effectiveBranchId = order.branch_id || invoice?.branch_id;
    const effectiveUserId = userId || invoice?.user_id || order.user_id || 1;

    await knex.transaction(async (trx) => {
      // 1. Si tenía factura, revertir movimientos de caja, cuentas por cobrar, notas y stock
      if (invoice) {
        if (invoice.cash_register_id) {
          await trx('cash_movements')
            .where('cash_register_id', invoice.cash_register_id)
            .andWhere('description', 'like', `%Factura ${invoice.invoice_number}%`)
            .del();
        } else {
          await trx('cash_movements')
            .where('description', 'like', `%Factura ${invoice.invoice_number}%`)
            .del();
        }

        // Revertir saldo en clientes y cuentas por cobrar
        const arRecords = await trx('accounts_receivable').where({ invoice_id: invoice.id });
        if (invoice.customer_id) {
          for (const ar of arRecords) {
            const bal = parseFloat(ar.balance || 0);
            if (bal > 0) {
              await trx('customers')
                .where('id', invoice.customer_id)
                .decrement('credit_balance', bal);
            }
          }
        }
        await trx('accounts_receivable').where({ invoice_id: invoice.id }).del();

        // Revertir puntos de fidelización si aplica
        if (invoice.customer_id && parseFloat(invoice.total || 0) > 0) {
          const earnedPoints = Math.floor(parseFloat(invoice.total || 0) / 1000);
          if (earnedPoints > 0) {
            const cust = await trx('customers').where('id', invoice.customer_id).first();
            if (cust) {
              const currentPts = parseInt(cust.loyalty_points || 0, 10);
              await trx('customers').where('id', invoice.customer_id).update({
                loyalty_points: Math.max(0, currentPts - earnedPoints)
              });
            }
          }
        }

        // Eliminar notas crédito/débito vinculadas (evitar violación de foreign keys)
        await trx('credit_notes').where({ invoice_id: invoice.id }).del();
        await trx('debit_notes').where({ invoice_id: invoice.id }).del();

        // Eliminar asientos contables vinculados
        const jEntries = await trx('journal_entries').where({ reference_type: 'invoice', reference_id: invoice.id }).select('id');
        for (const je of jEntries) {
          await trx('journal_entry_lines').where({ journal_entry_id: je.id }).del();
          await trx('journal_entries').where({ id: je.id }).del();
        }

        // Restaurar inventario si se solicita
        if (restore_stock) {
          const orderItems = await trx('order_items').where('order_id', order.id);
          await restoreStockForInvoice(trx, {
            businessId,
            branchId: effectiveBranchId,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            items: orderItems,
            userId: effectiveUserId
          });
        }

        // Eliminar factura
        await trx('invoices').where('id', invoice.id).del();
      }

      // 2. Actualizar estado de la orden a 'cancelada'
      await trx('orders').where('id', id).update({
        status: 'cancelada',
        notes: reason ? `Cancelada: ${reason}` : (invoice ? `Factura #${invoice.invoice_number} Anulada` : 'Anulada por el usuario'),
        updated_at: knex.fn.now()
      });

      // 3. Actualizar estado de items y tickets de cocina / domicilios
      await trx('order_items').where('order_id', id).update({ status: 'cancelado' }).catch(() => {});
      await trx('kitchen_tickets').where('order_id', id).update({ status: 'cancelado' }).catch(() => {});
      await trx('delivery_assignments').where('order_id', id).update({ status: 'cancelado' }).catch(() => {});

      // 4. Liberar la mesa si aplica
      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
      }
    });

    if (req.app && req.app.locals && req.app.locals.io) {
      if (order.table_id && effectiveBranchId) {
        req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('table:status-changed', {
          table_id: order.table_id, status: 'libre'
        });
      }
      if (effectiveBranchId) {
        req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('order:updated', { order_id: id });
        if (invoice) {
          req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('invoice:annulled', { invoice_id: invoice.id, invoice_number: invoice.invoice_number });
        }
      }
      req.app.locals.io.to(`business:${businessId}`).emit('order:updated', { order_id: id });
      req.app.locals.io.emit('order:status-changed', { order_id: id, status: 'cancelada' });
      if (invoice) {
        req.app.locals.io.to(`business:${businessId}`).emit('invoice:annulled', { invoice_id: invoice.id, invoice_number: invoice.invoice_number });
        req.app.locals.io.emit('invoice:annulled', { invoice_id: invoice.id, invoice_number: invoice.invoice_number });
      }
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
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .select(
        'kt.*',
        'o.order_type',
        'o.table_id',
        't.table_number as order_table_number',
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
    const normalizedTickets = (tickets || []).map(t => {
      let items = [];
      if (Array.isArray(t.items_json)) {
        items = t.items_json;
      } else if (typeof t.items_json === 'string') {
        try {
          items = JSON.parse(t.items_json);
        } catch (e) {
          items = [];
        }
      }

      let finalTableNumber = t.table_number;
      if (t.order_table_number || t.table_id) {
        const rawNum = t.order_table_number || t.table_id;
        const clean = String(rawNum).replace(/^mesa\s*/i, '').trim();
        finalTableNumber = `Mesa ${clean}`;
      }

      return {
        ...t,
        table_number: finalTableNumber,
        items
      };
    });

    res.json(normalizedTickets);
  } catch (err) {
    console.error('Error al consultar cola de cocina:', err);
    res.status(500).json({ error: 'Error al consultar cola de cocina', details: err.message });
  }
};

exports.getKitchenActiveTickets = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    // Auto-healing: verificar si hay órdenes activas en cocina que no tengan ticket en kitchen_tickets
    try {
      const orphanOrders = await knex('orders as o')
        .where('o.business_id', businessId)
        .whereIn('o.status', ['enviado_cocina', 'en_preparacion'])
        .whereNotExists(function() {
          this.select('*').from('kitchen_tickets as kt')
            .whereRaw('kt.order_id = o.id')
            .whereIn('kt.status', ['pendiente', 'en_preparacion']);
        });

      for (const ord of orphanOrders) {
        const oItems = await knex('order_items as oi')
          .join('products as p', 'oi.product_id', 'p.id')
          .select('oi.*', 'p.name')
          .where('oi.order_id', ord.id)
          .whereNot('oi.status', 'cancelado');

        if (oItems.length > 0) {
          const formatted = oItems.map(i => {
            let modsText = '';
            if (i.modifiers_json) {
              try {
                const parsed = typeof i.modifiers_json === 'string' ? JSON.parse(i.modifiers_json) : i.modifiers_json;
                if (Array.isArray(parsed) && parsed.length > 0) {
                  modsText = parsed.map(m => m.name + (m.quantity > 1 ? ` (x${m.quantity})` : '')).join(', ');
                }
              } catch (e) {}
            }
            return {
              name: i.name,
              quantity: i.quantity,
              notes: i.notes || null,
              modifiers: modsText || undefined,
              modifiers_json: i.modifiers_json
            };
          });

          const tableLabel = ord.table_id ? `Mesa ${ord.table_id}` : (ord.order_type === 'delivery' ? 'PARA LLEVAR (DOMICILIO)' : 'PARA LLEVAR');
          await knex('kitchen_tickets').insert({
            business_id: businessId,
            branch_id: ord.branch_id,
            order_id: ord.id,
            table_number: tableLabel,
            status: ord.status === 'en_preparacion' ? 'en_preparacion' : 'pendiente',
            items_json: JSON.stringify(formatted),
            created_at: ord.created_at || knex.fn.now()
          });
        }
      }
    } catch (healErr) {
      console.warn('[Kitchen] Advertencia en auto-healing de comandas:', healErr.message);
    }

    let query = knex('kitchen_tickets as kt')
      .leftJoin('orders as o', 'kt.order_id', 'o.id')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('users as u', 'o.user_id', 'u.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .select(
        'kt.*',
        'o.order_type',
        'o.table_id',
        'o.delivery_address',
        'o.delivery_phone',
        'o.notes as order_notes',
        'o.status as order_status',
        't.table_number as order_table_number',
        'u.full_name as waiter_name',
        'c.name as customer_name'
      )
      .where('kt.business_id', businessId)
      .whereIn('kt.status', ['pendiente', 'en_preparacion'])
      .whereNot('o.status', 'cancelada')
      .whereNot('o.status', 'cerrada')
      .orderBy('kt.id', 'asc');

    if (branchId && !isGlobalScope) {
      query.andWhere('kt.branch_id', branchId);
    }

    const tickets = await query;

    // Normalizar items_json a array en cada ticket
    const formattedTickets = tickets.map(t => {
      let items = [];
      if (t.items_json) {
        if (typeof t.items_json === 'string') {
          try {
            items = JSON.parse(t.items_json);
          } catch (e) {
            items = [];
          }
        } else if (Array.isArray(t.items_json)) {
          items = t.items_json;
        }
      }

      let finalTableNumber = t.table_number;
      if (t.order_table_number || t.table_id) {
        const rawNum = t.order_table_number || t.table_id;
        const clean = String(rawNum).replace(/^mesa\s*/i, '').trim();
        finalTableNumber = `Mesa ${clean}`;
      }

      return {
        ...t,
        table_number: finalTableNumber,
        items
      };
    });

    res.json(formattedTickets);
  } catch (err) {
    console.error('Error al consultar comandas activas de cocina:', err);
    res.status(500).json({ error: 'Error al consultar comandas de cocina', details: err.message });
  }
};

exports.updateKitchenTicketStatus = async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body;
  const { businessId, branchId } = req.tenant;

  try {
    const ticket = await knex('kitchen_tickets')
      .where({ id: ticketId, business_id: businessId })
      .first();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket de comanda no encontrado' });
    }

    const updateData = { status };
    if (status === 'lista') {
      updateData.completed_at = knex.fn.now();
    }

    await knex('kitchen_tickets').where('id', ticketId).update(updateData);

    const updatedTicket = await knex('kitchen_tickets').where('id', ticketId).first();

    let itemsList = [];
    if (updatedTicket.items_json) {
      try {
        itemsList = typeof updatedTicket.items_json === 'string' ? JSON.parse(updatedTicket.items_json) : updatedTicket.items_json;
      } catch (e) {}
    }

    // Verificar si quedan tickets pendientes para esta orden
    const activeTickets = await knex('kitchen_tickets')
      .where({ order_id: ticket.order_id, business_id: businessId })
      .whereIn('status', ['pendiente', 'en_preparacion']);

    let allReady = false;
    if (activeTickets.length === 0 && status === 'lista') {
      allReady = true;
      await knex('orders').where('id', ticket.order_id).update({
        status: 'lista',
        updated_at: knex.fn.now()
      });
    }

    if (req.app && req.app.locals && req.app.locals.io) {
      const io = req.app.locals.io;
      const effectiveBranchId = ticket.branch_id || branchId;

      emitToBranchAndBusiness(io, effectiveBranchId, businessId, 'kitchen:update-status', {
        ticketId: parseInt(ticketId, 10),
        status,
        orderId: ticket.order_id,
        table_number: ticket.table_number
      });

      if (status === 'lista') {
        const summary = (Array.isArray(itemsList) ? itemsList : []).map(i => `${i.quantity}x ${i.name}`).join(', ');
        emitToBranchAndBusiness(io, effectiveBranchId, businessId, 'kitchen:ticket-ready', {
          ticketId: parseInt(ticketId, 10),
          orderId: ticket.order_id,
          table_number: ticket.table_number,
          summary,
          allReady
        });
      }

      emitToBranchAndBusiness(io, effectiveBranchId, businessId, 'order:updated', { order_id: ticket.order_id });
    }

    res.json({
      message: 'Estado de la comanda actualizado exitosamente',
      ticket: updatedTicket,
      allReady
    });
  } catch (err) {
    console.error('Error al actualizar estado de la comanda:', err);
    res.status(500).json({ error: 'Error al actualizar estado de la comanda', details: err.message });
  }
};


