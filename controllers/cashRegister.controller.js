/**
 * Cash Register Controller — Multi-tenant
 * Cada sucursal tiene su propia caja, aislada de otras sucursales
 */
const knex = require('../database/knex');

exports.open = async (req, res) => {
  const opening_amount = parseFloat(req.body.opening_amount !== undefined ? req.body.opening_amount : (req.body.initial_amount !== undefined ? req.body.initial_amount : 0));
  let { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  if (!branchId) {
    const defaultBranch = await knex('branches').where('business_id', businessId).first();
    branchId = defaultBranch?.id;
  }

  if (!branchId) return res.status(400).json({ error: 'Se requiere una sucursal activa' });

  try {
    // Verificar si ya hay una caja abierta en ESTA sucursal
    const current = await knex('cash_registers')
      .where({ branch_id: branchId, status: 'abierta' })
      .first();

    if (current) return res.status(400).json({ error: 'Ya existe una caja abierta en esta sucursal', register: current });

    const [register] = await knex('cash_registers').insert({
      business_id: businessId,
      branch_id: branchId,
      user_id,
      opening_amount
    }).returning('*');

    if (req.app?.locals?.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:status-changed', { status: 'abierta', register });
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:opened', register);
    }

    res.status(201).json({ id: register.id, message: 'Caja abierta exitosamente', register });
  } catch (err) {
    console.error('Error al abrir caja:', err);
    res.status(500).json({ error: 'Error al abrir caja: ' + err.message });
  }
};

exports.getCurrent = async (req, res) => {
  const { branchId } = req.tenant;

  try {
    // Buscar caja abierta: primero la del usuario, luego cualquier abierta en la sucursal
    const register = await knex('cash_registers')
      .where({ user_id: req.user.id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(404).json({ error: 'No hay caja abierta en esta sucursal' });
    res.json(register);
  } catch (err) {
    console.error('Error al obtener caja actual:', err);
    res.status(500).json({ error: 'Error al obtener caja actual' });
  }
};

exports.addMovement = async (req, res) => {
  const { type, amount, payment_method, description } = req.body;
  const { branchId } = req.tenant;

  try {
    const register = await knex('cash_registers')
      .where({ user_id: req.user.id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(400).json({ error: 'Debes abrir una caja primero' });

    const [movement] = await knex('cash_movements').insert({
      cash_register_id: register.id,
      type,
      amount,
      payment_method: payment_method || 'efectivo',
      description: description || null
    }).returning('*');

    if (req.app?.locals?.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:movement-added', movement);
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:status-changed', { status: 'abierta', register });
    }

    res.json({ id: movement.id, message: 'Movimiento registrado' });
  } catch (err) {
    console.error('Error al registrar movimiento:', err);
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
};

exports.getShiftSummary = async (req, res) => {
  const { branchId } = req.tenant;

  try {
    const register = await knex('cash_registers')
      .where({ user_id: req.user.id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(404).json({ error: 'No hay caja abierta' });

    const invoices = await knex('invoices')
      .select('payment_method', 'subtotal', 'tax_total', 'tip_amount', 'total')
      .where('cash_register_id', register.id);

    let cashSales = 0, cardSales = 0, transferSales = 0, creditSales = 0, totalTips = 0;

    invoices.forEach(inv => {
      totalTips += parseFloat(inv.tip_amount || 0);
      const total = parseFloat(inv.total);
      if (inv.payment_method === 'efectivo') cashSales += total;
      else if (inv.payment_method === 'tarjeta') cardSales += total;
      else if (inv.payment_method === 'transferencia') transferSales += total;
      else if (inv.payment_method === 'credito') creditSales += total;
      else cashSales += total;
    });

    const movements = await knex('cash_movements')
      .select('type', 'amount', 'payment_method')
      .where('cash_register_id', register.id);

    let cashInflows = 0, cashOutflows = 0, cashRefunds = 0;
    movements.forEach(m => {
      const amt = parseFloat(m.amount);
      if (m.type === 'ingreso' && m.payment_method === 'efectivo') cashInflows += amt;
      if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') cashOutflows += amt;
      if (m.type === 'devolucion' && m.payment_method === 'efectivo') cashRefunds += amt;
    });

    // Auditoría: órdenes canceladas del día en esta sucursal
    const auditRow = await knex('orders as o')
      .leftJoin('order_items as oi', 'o.id', 'oi.order_id')
      .where('o.status', 'cancelada')
      .andWhere('o.branch_id', branchId)
      .andWhereRaw("DATE(o.updated_at) = CURRENT_DATE")
      .select(
        knex.raw('COALESCE(COUNT(DISTINCT o.id), 0) as canceled_orders_count'),
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as canceled_amount')
      )
      .first();

    const initialFloat = parseFloat(register.opening_amount || 0);
    const expectedCash = (initialFloat + cashSales + cashInflows) - (cashOutflows + cashRefunds);

    res.json({
      cash_register_id: register.id,
      user_id: register.user_id,
      opened_at: register.opened_at,
      initialFloat,
      openingAmount: initialFloat,
      opening_amount: initialFloat,
      cashSales, cashInflows, cashOutflows, cashRefunds, expectedCash,
      cardSales, transferSales, creditSales, totalTips,
      audit: {
        canceledOrdersCount: parseInt(auditRow?.canceled_orders_count || 0),
        canceledAmount: parseFloat(auditRow?.canceled_amount || 0)
      }
    });
  } catch (err) {
    console.error('Error al obtener resumen de turno:', err);
    res.status(500).json({ error: 'Error al calcular resumen de turno' });
  }
};

exports.close = async (req, res) => {
  const { closing_amount } = req.body;
  const { businessId, branchId } = req.tenant;

  try {
    const register = await knex('cash_registers')
      .where({ user_id: req.user.id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });

    // Obtener facturas con detalles
    const invoices = await knex('invoices as i')
      .join('orders as o', 'i.order_id', 'o.id')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .join('users as u', 'o.user_id', 'u.id')
      .select('i.*', 'o.table_id', 't.table_number', 'u.full_name as waiter_name')
      .where('i.cash_register_id', register.id);

    let grossRevenue = 0, netRevenue = 0, taxTotal = 0, totalTips = 0;
    let cashSales = 0, cardSales = 0, transferSales = 0, creditSales = 0;

    invoices.forEach(inv => {
      grossRevenue += parseFloat(inv.total);
      netRevenue += parseFloat(inv.subtotal);
      taxTotal += parseFloat(inv.tax_total);
      totalTips += parseFloat(inv.tip_amount || 0);
      const total = parseFloat(inv.total);
      if (inv.payment_method === 'efectivo') cashSales += total;
      else if (inv.payment_method === 'tarjeta') cardSales += total;
      else if (inv.payment_method === 'transferencia') transferSales += total;
      else if (inv.payment_method === 'credito') creditSales += total;
      else cashSales += total;
    });

    const movements = await knex('cash_movements')
      .select('type', 'amount', 'payment_method', 'description', 'created_at')
      .where('cash_register_id', register.id);

    let cashInflows = 0, cashOutflows = 0, cashRefunds = 0;
    movements.forEach(m => {
      const amt = parseFloat(m.amount);
      if (m.type === 'ingreso' && m.payment_method === 'efectivo') cashInflows += amt;
      if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') cashOutflows += amt;
      if (m.type === 'devolucion' && m.payment_method === 'efectivo') cashRefunds += amt;
    });

    const expected = (parseFloat(register.opening_amount) + cashSales + cashInflows) - (cashOutflows + cashRefunds);
    const difference = closing_amount - expected;

    // Actualizar caja
    await knex('cash_registers').where('id', register.id).update({
      closing_amount,
      expected_amount: expected,
      difference,
      status: 'cerrada',
      closed_at: knex.fn.now()
    });

    const cashier = await knex('users').where('id', register.user_id).select('full_name').first();

    const voidRow = await knex('orders as o')
      .leftJoin('order_items as oi', 'o.id', 'oi.order_id')
      .where({ 'o.status': 'cancelada', 'o.branch_id': branchId })
      .andWhereRaw("DATE(o.updated_at) = CURRENT_DATE")
      .select(knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total'))
      .first();

    const totalVoids = parseFloat(voidRow?.total || 0);

    const itemizedSales = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('categories as c', 'p.category_id', 'c.id')
      .join('invoices as i', 'oi.order_id', 'i.order_id')
      .where('i.cash_register_id', register.id)
      .groupBy('p.id', 'p.name', 'c.name')
      .select(
        'p.name as product_name',
        'c.name as category_name',
        knex.raw('SUM(oi.quantity) as quantity'),
        knex.raw('SUM(oi.quantity * oi.unit_price) as total_sales'),
        knex.raw('AVG(oi.unit_price) as unit_price')
      );

    const snapshot = { invoices, itemizedSales, movements };

    const hour = new Date().getHours();
    const shiftName = hour < 15 ? 'Jornada Mañana' : 'Jornada Tarde / Noche';

    try {
      await knex('shift_reports').insert({
        business_id: businessId,
        branch_id: branchId,
        cash_register_id: register.id,
        user_id: register.user_id,
        user_name: cashier?.full_name || 'Cajero',
        shift_name: shiftName,
        opened_at: register.opened_at,
        closed_at: knex.fn.now(),
        opening_amount: register.opening_amount,
        closing_amount,
        expected_amount: expected,
        difference,
        gross_revenue: grossRevenue,
        net_revenue: netRevenue,
        tax_total: taxTotal,
        total_tips: totalTips,
        total_tickets: invoices.length,
        cash_sales: cashSales,
        card_sales: cardSales,
        transfer_sales: transferSales,
        total_withdrawals: cashOutflows,
        total_voids: totalVoids,
        snapshot_json: JSON.stringify(snapshot)
      });
    } catch (e) {
      console.error('Error al insertar shift_report:', e);
    }

    if (req.app?.locals?.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:status-changed', { status: 'cerrada', register_id: register.id });
      req.app.locals.io.to(`branch:${branchId}`).emit('cash:closed', { register_id: register.id });
    }

    res.json({
      message: 'Caja cerrada y Reporte Z guardado exitosamente',
      expected,
      difference,
      opening_amount: parseFloat(register.opening_amount || 0),
      openingAmount: parseFloat(register.opening_amount || 0)
    });
  } catch (err) {
    console.error('Error al cerrar caja:', err);
    res.status(500).json({ error: 'Error al cerrar caja' });
  }
};

exports.getReport = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    const register = await knex('cash_registers')
      .where({ id, business_id: businessId })
      .first();
    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });

    const movements = await knex('cash_movements')
      .where('cash_register_id', id)
      .groupBy('type', 'payment_method')
      .select('type', 'payment_method', knex.raw('SUM(amount) as total'));

    // Calcular ventas por método de pago para este turno
    const invoices = await knex('invoices')
      .where('cash_register_id', id)
      .select('payment_method', 'total', 'tip_amount');

    let cashSales = 0, cardSales = 0, transferSales = 0, creditSales = 0, totalTips = 0;
    invoices.forEach(inv => {
      const tot = parseFloat(inv.total || 0);
      totalTips += parseFloat(inv.tip_amount || 0);
      if (inv.payment_method === 'efectivo' || !inv.payment_method) cashSales += tot;
      else if (inv.payment_method === 'tarjeta') cardSales += tot;
      else if (inv.payment_method === 'transferencia') transferSales += tot;
      else if (inv.payment_method === 'credito') creditSales += tot;
      else cashSales += tot;
    });

    let cashInflows = 0, cashOutflows = 0;
    movements.forEach(m => {
      const amt = parseFloat(m.total || 0);
      if (m.type === 'ingreso' && m.payment_method === 'efectivo') cashInflows += amt;
      if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') cashOutflows += amt;
    });

    const initialFloat = parseFloat(register.opening_amount || 0);
    const expectedCash = initialFloat + cashSales + cashInflows - cashOutflows;

    res.json({
      register,
      movements,
      salesSummary: {
        cashSales, cardSales, transferSales, creditSales, totalTips,
        cashInflows, cashOutflows,
        invoicesCount: invoices.length,
        initialFloat,
        expectedCash
      }
    });
  } catch (err) {
    console.error('Error al obtener reporte de caja:', err);
    res.status(500).json({ error: 'Error al obtener reporte de caja' });
  }
};
