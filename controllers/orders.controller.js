/**
 * Orders Controller — Multi-tenant
 * Órdenes filtradas por branch_id, con toda la lógica de ítems y cocina
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { status, table_id } = req.query;

    let query = knex('orders as o')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .join('users as u', 'o.user_id', 'u.id')
      .select('o.*', 't.table_number', 'u.full_name as waiter_name')
      .where('o.business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('o.branch_id', branchId);
    }

    if (status) query.andWhere('o.status', status);
    if (table_id) query.andWhere('o.table_id', table_id);

    query.orderBy('o.id', 'desc');

    const orders = await query;

    // Cargar ítems de cada orden
    for (const order of orders) {
      order.items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name')
        .where('oi.order_id', order.id);
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
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .join('users as u', 'o.user_id', 'u.id')
      .select('o.*', 't.table_number', 'u.full_name as waiter_name')
      .where({ 'o.id': req.params.id, 'o.business_id': businessId })
      .first();

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    order.items = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', order.id);

    res.json(order);
  } catch (err) {
    console.error('Error al obtener orden:', err);
    res.status(500).json({ error: 'Error al obtener orden' });
  }
};

exports.create = async (req, res) => {
  const { table_id, guests, notes } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  if (!branchId) return res.status(400).json({ error: 'Se requiere una sucursal activa' });

  try {
    const table = await knex('tables_restaurant')
      .where({ id: table_id, business_id: businessId })
      .first();
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

    const existingOrder = await knex('orders')
      .where('table_id', table_id)
      .whereIn('status', ['abierta', 'en_preparacion', 'lista', 'pendiente_pago'])
      .orderBy('id', 'desc')
      .first();

    if (existingOrder) {
      return res.status(200).json({ id: existingOrder.id, message: 'Orden existente recuperada' });
    }

    const [newOrder] = await knex('orders').insert({
      business_id: businessId,
      branch_id: branchId,
      table_id,
      user_id,
      guests: guests || 1,
      notes: notes || null
    }).returning('*');

    res.status(201).json({ id: newOrder.id, message: 'Orden creada exitosamente' });
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

        if (priceToUse < parseFloat(product.price)) {
          throw new Error(`El precio de "${product.name}" no puede ser menor a su precio base ($${product.price}).`);
        }

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
      await trx('tables_restaurant').where('id', order.table_id).update({ status: 'ocupada' });
    });

    if (req.app.locals.io) {
      const branchId = order.branch_id;
      req.app.locals.io.to(`branch:${branchId}`).emit('order:updated', { order_id: id });
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', { table_id: order.table_id, status: 'ocupada' });
    }

    res.json({ message: 'Ítems agregados a la orden' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al agregar ítems' });
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

    if (parseInt(remainingCount.count) === 0 && order && order.status === 'abierta') {
      await knex('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
      if (req.app.locals.io) {
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
      .join('tables_restaurant as t', 'o.table_id', 't.id')
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

    await knex.transaction(async (trx) => {
      await trx('kitchen_tickets').insert({
        business_id: businessId,
        branch_id: order.branch_id,
        order_id: id,
        table_number: order.table_number,
        items_json: JSON.stringify(itemsJson)
      });

      await trx('order_items')
        .where({ order_id: id, status: 'pendiente' })
        .update({ status: 'enviado_cocina', sent_to_kitchen_at: knex.fn.now() });

      await trx('orders').where('id', id).update({ status: 'en_preparacion', updated_at: knex.fn.now() });
      await trx('tables_restaurant').where('id', order.table_id).update({ status: 'ocupada' });
    });

    if (req.app.locals.io) {
      const branchId = order.branch_id;
      req.app.locals.io.to(`branch:${branchId}`).emit('kitchen:new-ticket', {
        order_id: id, table_number: order.table_number
      });
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', {
        table_id: order.table_id, status: 'ocupada'
      });
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
      await trx('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
    });

    if (req.app.locals.io) {
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('table:status-changed', {
        table_id: order.table_id, status: 'libre'
      });
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
          .join('tables_restaurant as t', 'o.table_id', 't.id')
          .select('o.id', 't.table_number')
          .where('o.id', id)
          .first();

        const items = await knex('order_items as oi')
          .join('products as p', 'oi.product_id', 'p.id')
          .select('p.name', 'oi.quantity')
          .where('oi.order_id', id);

        const summary = items.map(i => `${i.quantity}x ${i.name}`).join(', ');

        req.app.locals.io.to(`branch:${order.branch_id}`).emit('kitchen:ticket-ready', {
          orderId: id,
          table_number: orderData ? orderData.table_number : `#${id}`,
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

