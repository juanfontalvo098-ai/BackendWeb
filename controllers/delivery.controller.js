/**
 * Delivery Controller — Multi-tenant
 * Zonas de delivery, asignación de domiciliarios, tracking de entregas
 */
const knex = require('../database/knex');

// --- Zonas de delivery ---
exports.getZones = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const zones = await knex('delivery_zones')
      .where('business_id', businessId)
      .orderBy('name');
    res.json(zones);
  } catch (err) {
    console.error('Error al obtener zonas:', err);
    res.status(500).json({ error: 'Error al obtener zonas de delivery' });
  }
};

exports.createZone = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { name, delivery_fee, estimated_time_mins } = req.body;

    const [zone] = await knex('delivery_zones').insert({
      business_id: businessId,
      name,
      delivery_fee: delivery_fee || 0,
      estimated_time_mins: estimated_time_mins || 30
    }).returning('*');

    res.status(201).json(zone);
  } catch (err) {
    console.error('Error al crear zona:', err);
    res.status(500).json({ error: 'Error al crear zona' });
  }
};

exports.updateZone = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { name, delivery_fee, estimated_time_mins, is_active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (delivery_fee !== undefined) updateData.delivery_fee = parseFloat(delivery_fee);
    if (estimated_time_mins !== undefined) updateData.estimated_time_mins = parseInt(estimated_time_mins);
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    await knex('delivery_zones').where({ id, business_id: businessId }).update(updateData);
    res.json({ message: 'Zona actualizada' });
  } catch (err) {
    console.error('Error al actualizar zona:', err);
    res.status(500).json({ error: 'Error al actualizar zona' });
  }
};

// --- Asignaciones y Despachos de delivery ---
exports.getAssignments = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { status, driver_user_id } = req.query;

    let query = knex('orders as o')
      .leftJoin('delivery_assignments as da', 'o.id', 'da.order_id')
      .leftJoin('users as driver', 'da.driver_user_id', 'driver.id')
      .leftJoin('delivery_zones as dz', 'da.delivery_zone_id', 'dz.id')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .select(
        'o.id as order_id',
        'da.id as id',
        'da.status as assignment_status',
        'da.assigned_at',
        'da.picked_up_at',
        'da.delivered_at',
        'da.notes as assignment_notes',
        'da.driver_user_id',
        'da.delivery_zone_id',
        'o.order_type',
        'o.delivery_address',
        'o.delivery_phone',
        'o.delivery_notes',
        'o.delivery_fee',
        'o.discount_amount',
        'o.status as order_status',
        'o.created_at as order_date',
        'driver.full_name as driver_name',
        'dz.name as zone_name',
        'dz.delivery_fee as zone_delivery_fee',
        'c.name as customer_name',
        'c.phone as customer_phone'
      )
      .where('o.business_id', businessId)
      .andWhere('o.order_type', 'delivery')
      .whereNotIn('o.status', ['cancelada']);

    if (branchId && !isGlobalScope) query.andWhere('o.branch_id', branchId);
    if (status) {
      if (status === 'sin_asignar') {
        query.whereNull('da.id');
      } else {
        query.andWhere('da.status', status);
      }
    }
    if (driver_user_id) query.andWhere('da.driver_user_id', parseInt(driver_user_id));

    const rows = await query.orderBy('o.created_at', 'desc');

    // Cargar ítems y calcular total para cada despacho
    for (const a of rows) {
      // Estado unificado del despacho
      a.status = a.assignment_status || 'sin_asignar';

      const items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name')
        .where('oi.order_id', a.order_id);

      let itemsTotal = 0;
      items.forEach(i => {
        itemsTotal += (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      });

      const delFee = parseFloat(a.delivery_fee !== null && a.delivery_fee !== undefined ? a.delivery_fee : (a.zone_delivery_fee || 0));
      const disc = parseFloat(a.discount_amount || 0);

      a.items = items;
      a.items_total = itemsTotal;
      a.delivery_fee = delFee;
      a.grand_total = Math.max(0, itemsTotal - disc) + delFee;
    }

    res.json(rows);
  } catch (err) {
    console.error('Error al obtener asignaciones:', err);
    res.status(500).json({ error: 'Error al obtener asignaciones de delivery' });
  }
};

exports.assignDriver = async (req, res) => {
  try {
    const { order_id, driver_user_id, delivery_zone_id, delivery_fee, notes } = req.body;

    // Actualizar delivery_fee en orden si se especificó
    if (delivery_fee !== undefined) {
      await knex('orders').where('id', order_id).update({
        delivery_fee: parseFloat(delivery_fee) || 0
      });
    }

    const existing = await knex('delivery_assignments').where({ order_id }).first();
    let assignment;

    if (existing) {
      const [updated] = await knex('delivery_assignments').where({ id: existing.id }).update({
        driver_user_id: parseInt(driver_user_id, 10),
        delivery_zone_id: delivery_zone_id ? parseInt(delivery_zone_id, 10) : null,
        notes: notes || null,
        status: 'asignado',
        assigned_at: knex.fn.now()
      }).returning('*');
      assignment = updated;
    } else {
      const [inserted] = await knex('delivery_assignments').insert({
        order_id: parseInt(order_id, 10),
        driver_user_id: parseInt(driver_user_id, 10),
        delivery_zone_id: delivery_zone_id ? parseInt(delivery_zone_id, 10) : null,
        notes: notes || null,
        status: 'asignado'
      }).returning('*');
      assignment = inserted;
    }

    // Emitir evento por WebSocket
    const order = await knex('orders').where('id', order_id).first();
    if (req.app && req.app.locals && req.app.locals.io && order) {
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('delivery:assigned', {
        order_id, driver_user_id
      });
      req.app.locals.io.to(`branch:${order.branch_id}`).emit('delivery:status-changed', {
        order_id, status: 'asignado'
      });
    }

    res.status(201).json(assignment);
  } catch (err) {
    console.error('Error al asignar domiciliario:', err);
    res.status(500).json({ error: 'Error al asignar domiciliario' });
  }
};

exports.updateAssignmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updateData = { status };
    if (status === 'en_camino') updateData.picked_up_at = knex.fn.now();
    if (status === 'entregado') updateData.delivered_at = knex.fn.now();

    await knex('delivery_assignments').where('id', id).update(updateData);

    // Emitir evento
    const assignment = await knex('delivery_assignments').where('id', id).first();
    if (assignment) {
      const order = await knex('orders').where('id', assignment.order_id).first();
      if (req.app && req.app.locals && req.app.locals.io && order) {
        req.app.locals.io.to(`branch:${order.branch_id}`).emit('delivery:status-changed', {
          order_id: assignment.order_id, status
        });
      }
    }

    res.json({ message: 'Estado de entrega actualizado' });
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error al actualizar estado de entrega' });
  }
};

// Obtener pedidos pendientes de asignación de delivery
exports.getPendingOrders = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('orders as o')
      .leftJoin('customers as c', 'o.customer_id', 'c.id')
      .leftJoin('delivery_assignments as da', 'o.id', 'da.order_id')
      .select('o.*', 'c.name as customer_name', 'c.phone as customer_phone', 'c.address as customer_address')
      .where('o.business_id', businessId)
      .andWhere('o.order_type', 'delivery')
      .whereNotIn('o.status', ['cerrada', 'cancelada'])
      .whereNull('da.id');

    if (branchId && !isGlobalScope) query.andWhere('o.branch_id', branchId);

    const pending = await query.orderBy('o.created_at', 'desc');

    for (const po of pending) {
      const items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name')
        .where('oi.order_id', po.id);
      po.items = items;
      let itemsTotal = 0;
      items.forEach(i => {
        itemsTotal += (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      });
      po.items_total = itemsTotal;
      po.computed_total = Math.max(0, itemsTotal - (parseFloat(po.discount_amount) || 0)) + (parseFloat(po.delivery_fee) || 0);
    }

    res.json(pending);
  } catch (err) {
    console.error('Error al obtener pedidos pendientes de delivery:', err);
    res.status(500).json({ error: 'Error al obtener pedidos pendientes' });
  }
};

// Crear una orden de delivery completa con ítems y asignación inmediata
exports.createDeliveryOrder = async (req, res) => {
  const trx = await knex.transaction();
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const {
      customer_id, delivery_address, delivery_phone, delivery_notes,
      delivery_zone_id, driver_user_id, delivery_fee, items, discount_amount, discount_type
    } = req.body;

    // Asegurar branch_id válido
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await trx('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    // Calcular tarifa de domicilio si no se envió explícita pero hay zona
    let finalDeliveryFee = parseFloat(delivery_fee);
    if (isNaN(finalDeliveryFee) && delivery_zone_id) {
      const zone = await trx('delivery_zones').where('id', delivery_zone_id).first();
      finalDeliveryFee = zone ? parseFloat(zone.delivery_fee || 0) : 0;
    }
    if (isNaN(finalDeliveryFee)) finalDeliveryFee = 0;

    // 1. Crear Orden
    const [order] = await trx('orders').insert({
      business_id: businessId,
      branch_id: targetBranchId,
      user_id: userId,
      table_id: null,
      order_type: 'delivery',
      customer_id: customer_id ? parseInt(customer_id, 10) : null,
      delivery_address: delivery_address || 'Dirección no especificada',
      delivery_phone: delivery_phone || null,
      delivery_notes: delivery_notes || null,
      delivery_fee: finalDeliveryFee,
      discount_amount: parseFloat(discount_amount) || 0,
      discount_type: discount_type || null,
      status: 'abierta'
    }).returning('*');

    // 2. Insertar Ítems
    if (Array.isArray(items) && items.length > 0) {
      const validItems = items.filter(i => i.product_id);
      if (validItems.length > 0) {
        const productIds = validItems.map(i => parseInt(i.product_id, 10));
        const dbProducts = await trx('products').whereIn('id', productIds);
        const prodMap = {};
        dbProducts.forEach(p => { prodMap[p.id] = p; });

        const orderItems = validItems.map(item => {
          const pId = parseInt(item.product_id, 10);
          const prod = prodMap[pId] || {};
          const modifiersVal = item.modifiers_json || item.modifiers;
          const modifiersJson = modifiersVal ? (typeof modifiersVal === 'string' ? modifiersVal : JSON.stringify(modifiersVal)) : null;

          return {
            order_id: order.id,
            product_id: pId,
            quantity: parseInt(item.quantity, 10) || 1,
            unit_price: parseFloat(item.unit_price || prod.price || 0),
            tax_rate: parseFloat(prod.tax_rate || 0),
            tax_included: prod.tax_included !== undefined ? Boolean(prod.tax_included) : true,
            notes: item.notes || null,
            modifiers_json: modifiersJson,
            status: 'pendiente'
          };
        });
        await trx('order_items').insert(orderItems);
      }
    }

    // 3. Crear Asignación de Domiciliario si se especificó
    let assignment = null;
    if (driver_user_id) {
      [assignment] = await trx('delivery_assignments').insert({
        order_id: order.id,
        driver_user_id: parseInt(driver_user_id, 10),
        delivery_zone_id: delivery_zone_id ? parseInt(delivery_zone_id, 10) : null,
        notes: delivery_notes || null,
        status: 'asignado'
      }).returning('*');
    }

    await trx.commit();

    // 4. Emitir eventos WebSocket
    if (req.app.locals.io) {
      req.app.locals.io.to(`branch:${targetBranchId}`).emit('order:created', order);
      if (assignment) {
        req.app.locals.io.to(`branch:${targetBranchId}`).emit('delivery:assigned', {
          order_id: order.id, driver_user_id
        });
      }
    }

    res.status(201).json({ order, assignment });
  } catch (err) {
    await trx.rollback();
    console.error('Error al crear orden de delivery:', err);
    res.status(500).json({ error: 'Error al crear orden de delivery: ' + err.message });
  }
};

// Obtener domiciliarios disponibles (usuarios con rol mesero, cajero, gerente o admin)
exports.getDrivers = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const drivers = await knex('users')
      .where({ business_id: businessId, is_active: true })
      .select('id', 'full_name', 'role', 'username');
    res.json(drivers);
  } catch (err) {
    console.error('Error al obtener domiciliarios:', err);
    res.status(500).json({ error: 'Error al obtener domiciliarios' });
  }
};
