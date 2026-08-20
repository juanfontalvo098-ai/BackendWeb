/**
 * Dashboard Controller — Multi-tenant
 * KPIs y métricas filtradas por branch_id (o agregadas por business_id para admin)
 * Usa funciones de fecha de PostgreSQL (NOW(), CURRENT_DATE, INTERVAL)
 */
const knex = require('../database/knex');

exports.getMetrics = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { period, startDate, endDate } = req.query;

    // Helper: construir condición de fecha para PostgreSQL
    const addDateFilter = (query, dateCol) => {
      if (period === 'yesterday') {
        query.whereRaw(`DATE(${dateCol}) = CURRENT_DATE - INTERVAL '1 day'`);
      } else if (period === 'last7') {
        query.whereRaw(`DATE(${dateCol}) >= CURRENT_DATE - INTERVAL '7 days'`);
      } else if (period === 'month') {
        query.whereRaw(`TO_CHAR(${dateCol}, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`);
      } else if (period === 'custom' && startDate && endDate) {
        query.whereRaw(`DATE(${dateCol}) BETWEEN ? AND ?`, [startDate, endDate]);
      } else {
        // Default: hoy
        query.whereRaw(`DATE(${dateCol}) = CURRENT_DATE`);
      }
    };

    // Helper: filtro de tenant
    const addBranchFilter = (query, alias = '') => {
      const prefix = alias ? `${alias}.` : '';
      query.where(`${prefix}business_id`, businessId);
      if (branchId && !isGlobalScope) {
        query.andWhere(`${prefix}branch_id`, branchId);
      }
    };

    // 1. Hero KPIs (facturas)
    let kpiQuery = knex('invoices as i')
      .select(
        knex.raw('COALESCE(SUM(i.total), 0) as gross_sales'),
        knex.raw('COALESCE(SUM(i.subtotal), 0) as net_sales'),
        knex.raw('COALESCE(SUM(i.tax_total), 0) as tax_total'),
        knex.raw('COALESCE(SUM(i.tip_amount), 0) as total_tips'),
        knex.raw('COALESCE(SUM(i.discount_amount), 0) as total_discounts'),
        knex.raw('COALESCE(SUM(i.delivery_fee), 0) as total_delivery_fees'),
        knex.raw('COUNT(i.id) as total_tickets'),
        knex.raw('COALESCE(AVG(i.total), 0) as avg_ticket')
      );
    addBranchFilter(kpiQuery, 'i');
    addDateFilter(kpiQuery, 'i.created_at');
    const heroKpis = await kpiQuery.first();

    // Ocupación de Mesas
    let tablesQuery = knex('tables_restaurant');
    addBranchFilter(tablesQuery);
    const totalTables = await tablesQuery.clone().count('id as count').first();
    const occupiedTables = await tablesQuery.clone()
      .whereIn('status', ['ocupada', 'pendiente_pago'])
      .count('id as count')
      .first();

    const totalT = parseInt(totalTables?.count || 1);
    const occupiedT = parseInt(occupiedTables?.count || 0);
    const occupancyRate = ((occupiedT / totalT) * 100).toFixed(1);

    // 2. Live Operational
    let openOrdersQuery = knex('orders as o')
      .join('order_items as oi', 'o.id', 'oi.order_id')
      .whereIn('o.status', ['abierta', 'en_preparacion', 'lista'])
      .select(knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total'), knex.raw('COUNT(DISTINCT o.id) as count'));
    addBranchFilter(openOrdersQuery, 'o');
    const openOrdersValue = await openOrdersQuery.first();

    let prepTimeQuery = knex('kitchen_tickets')
      .whereNotNull('completed_at')
      .select(knex.raw("AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60) as avg_mins"));
    addBranchFilter(prepTimeQuery);
    const avgPrepTimeRow = await prepTimeQuery.first();
    const avgPrepTime = avgPrepTimeRow?.avg_mins ? Math.round(parseFloat(avgPrepTimeRow.avg_mins)) : 12;

    // 3. Payment Breakdown
    let paymentQuery = knex('invoices as i')
      .select('i.payment_method', knex.raw('COALESCE(SUM(i.total), 0) as total'), knex.raw('COUNT(i.id) as count'))
      .groupBy('i.payment_method')
      .orderBy('total', 'desc');
    addBranchFilter(paymentQuery, 'i');
    addDateFilter(paymentQuery, 'i.created_at');
    const payments = await paymentQuery;

    // 4. Canales de Venta (Order Types: Mesa, Domicilio, Para Llevar)
    let channelsQuery = knex('invoices as i')
      .join('orders as o', 'i.order_id', 'o.id')
      .select(
        knex.raw("COALESCE(o.order_type, 'dine_in') as channel"),
        knex.raw('COALESCE(SUM(i.total), 0) as total'),
        knex.raw('COUNT(i.id) as count')
      )
      .groupBy('channel')
      .orderBy('total', 'desc');
    addBranchFilter(channelsQuery, 'i');
    addDateFilter(channelsQuery, 'i.created_at');
    const channels = await channelsQuery;

    // Void Tracking
    let voidQuery = knex('orders as o')
      .leftJoin('order_items as oi', 'o.id', 'oi.order_id')
      .where('o.status', 'cancelada')
      .select(
        knex.raw('COUNT(DISTINCT o.id) as count'),
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total')
      );
    addBranchFilter(voidQuery, 'o');
    addDateFilter(voidQuery, 'o.created_at');
    const voidTracking = await voidQuery.first();

    // 5. Product Analytics
    let topQuery = knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('invoices as i', 'oi.order_id', 'i.order_id')
      .select(
        'p.id',
        'p.name',
        knex.raw('COALESCE(SUM(oi.quantity), 0) as volume'),
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales')
      )
      .groupBy('p.id', 'p.name')
      .orderBy('total_sales', 'desc')
      .limit(6);
    topQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) topQuery.andWhere('i.branch_id', branchId);
    addDateFilter(topQuery, 'i.created_at');
    const topProducts = await topQuery;

    let worstQuery = knex('products as p')
      .leftJoin('order_items as oi', 'p.id', 'oi.product_id')
      .leftJoin('invoices as i', 'oi.order_id', 'i.order_id')
      .where('p.business_id', businessId)
      .andWhere('p.is_available', true)
      .select(
        'p.id',
        'p.name',
        knex.raw('COALESCE(SUM(oi.quantity), 0) as volume'),
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales')
      )
      .groupBy('p.id', 'p.name')
      .orderBy('volume', 'asc')
      .limit(5);
    const worstProducts = await worstQuery;

    let catQuery = knex('categories as c')
      .join('products as p', 'c.id', 'p.category_id')
      .join('order_items as oi', 'p.id', 'oi.product_id')
      .join('invoices as i', 'oi.order_id', 'i.order_id')
      .where('c.business_id', businessId)
      .select(
        'c.id',
        'c.name as category_name',
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales'),
        knex.raw('COALESCE(SUM(oi.quantity), 0) as items_sold')
      )
      .groupBy('c.id', 'c.name')
      .orderBy('total_sales', 'desc');
    if (branchId && !isGlobalScope) catQuery.andWhere('i.branch_id', branchId);
    addDateFilter(catQuery, 'i.created_at');
    const categoryBreakdown = await catQuery;

    // 6. Staff Performance (Leaderboard)
    let staffQuery = knex('orders as o')
      .join('users as u', 'o.user_id', 'u.id')
      .join('invoices as i', 'o.id', 'i.order_id')
      .select(
        'u.id',
        'u.full_name as waiter_name',
        knex.raw('COUNT(DISTINCT i.id) as tickets_handled'),
        knex.raw('COALESCE(SUM(i.total), 0) as total_sales'),
        knex.raw('COALESCE(SUM(i.tip_amount), 0) as total_tips'),
        knex.raw('COALESCE(AVG(i.total), 0) as avg_ticket')
      )
      .groupBy('u.id', 'u.full_name')
      .orderBy('total_sales', 'desc')
      .limit(6);
    staffQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) staffQuery.andWhere('i.branch_id', branchId);
    addDateFilter(staffQuery, 'i.created_at');
    const staffPerformance = await staffQuery;

    // 7. Hourly Sales Trend
    let hourlyQuery = knex('invoices as i')
      .select(
        knex.raw("TO_CHAR(i.created_at, 'HH24:00') as hour"),
        knex.raw('COALESCE(SUM(i.total), 0) as total'),
        knex.raw('COUNT(i.id) as count')
      )
      .groupBy('hour')
      .orderBy('hour');
    hourlyQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) hourlyQuery.andWhere('i.branch_id', branchId);
    addDateFilter(hourlyQuery, 'i.created_at');
    const hourlySales = await hourlyQuery;

    // 8. Tendencia Diaria (para períodos multiescala como last7, month, custom)
    let dailyQuery = knex('invoices as i')
      .select(
        knex.raw("TO_CHAR(i.created_at, 'YYYY-MM-DD') as date"),
        knex.raw("TO_CHAR(i.created_at, 'Dy DD/MM') as label"),
        knex.raw('COALESCE(SUM(i.total), 0) as total'),
        knex.raw('COALESCE(SUM(i.subtotal), 0) as net'),
        knex.raw('COUNT(i.id) as count')
      )
      .groupBy('date', 'label')
      .orderBy('date', 'asc');
    dailyQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) dailyQuery.andWhere('i.branch_id', branchId);
    addDateFilter(dailyQuery, 'i.created_at');
    const dailySales = await dailyQuery;

    // 9. Top Clientes del Período
    let topCustomersQuery = knex('customers as c')
      .join('invoices as i', 'c.id', 'i.customer_id')
      .where('c.business_id', businessId)
      .whereNot('c.name', 'Consumidor Final')
      .select(
        'c.id',
        'c.name',
        'c.phone',
        knex.raw('COUNT(i.id) as total_orders'),
        knex.raw('COALESCE(SUM(i.total), 0) as total_spent'),
        knex.raw('COALESCE(MAX(i.created_at), c.created_at) as last_visit')
      )
      .groupBy('c.id', 'c.name', 'c.phone')
      .orderBy('total_spent', 'desc')
      .limit(5);
    if (branchId && !isGlobalScope) topCustomersQuery.andWhere('i.branch_id', branchId);
    addDateFilter(topCustomersQuery, 'i.created_at');
    const topCustomers = await topCustomersQuery;

    // 10. Alertas de Stock Bajo (Insumos o Productos)
    let lowStockSupplies = [];
    try {
      lowStockSupplies = await knex('supplies as s')
        .join('supplies_inventory as si', 's.id', 'si.supply_id')
        .where('s.business_id', businessId)
        .andWhere(function() {
          if (branchId && !isGlobalScope) {
            this.where('si.branch_id', branchId);
          }
        })
        .whereRaw('si.quantity <= s.min_stock')
        .select('s.id', 's.name', 's.unit_of_measure as unit', 'si.quantity as current_stock', 's.min_stock')
        .limit(5);
    } catch (e) {
      // Ignorar si la tabla no tuviese datos
    }

    // 11. Turno de Caja Actual en Vivo
    let currentShift = null;
    try {
      let shiftQuery = knex('cash_registers as cr')
        .leftJoin('users as u', 'cr.user_id', 'u.id')
        .whereRaw("LOWER(cr.status) = 'abierta'");

      if (branchId && !isGlobalScope) {
        shiftQuery.andWhere('cr.branch_id', branchId);
      } else if (businessId) {
        shiftQuery.andWhere('cr.business_id', businessId);
      }

      const openRegister = await shiftQuery
        .select('cr.*', 'u.full_name as user_name')
        .orderBy('cr.id', 'desc')
        .first();

      if (openRegister) {
        const invoices = await knex('invoices')
          .where({ cash_register_id: openRegister.id })
          .select('payment_method', 'total', 'tip_amount');

        let shiftCashSales = 0;
        let shiftTotalSales = 0;
        invoices.forEach(inv => {
          const tot = parseFloat(inv.total || 0);
          shiftTotalSales += tot;
          if (inv.payment_method === 'efectivo' || !inv.payment_method) {
            shiftCashSales += tot;
          }
        });

        const movements = await knex('cash_movements')
          .where({ cash_register_id: openRegister.id })
          .select('type', 'amount', 'payment_method');

        let shiftInflows = 0;
        let shiftOutflows = 0;
        movements.forEach(m => {
          const amt = parseFloat(m.amount || 0);
          if (m.type === 'ingreso' && m.payment_method === 'efectivo') shiftInflows += amt;
          if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') shiftOutflows += amt;
        });

        const initialAmount = parseFloat(openRegister.opening_amount || 0);
        const expectedCash = initialAmount + shiftCashSales + shiftInflows - shiftOutflows;

        currentShift = {
          id: openRegister.id,
          status: 'abierta',
          user_name: openRegister.user_name || 'Cajero',
          opened_at: openRegister.opened_at || openRegister.created_at || new Date().toISOString(),
          opening_amount: initialAmount,
          cash_sales: shiftCashSales,
          total_sales: shiftTotalSales,
          cash_inflows: shiftInflows,
          cash_outflows: shiftOutflows,
          expected_cash: expectedCash,
          invoices_count: invoices.length
        };
      }
    } catch (err) {
      console.error('Error al consultar turno actual en dashboard:', err);
    }

    res.json({
      period: period || 'today',
      kpis: {
        gross_sales: parseFloat(heroKpis.gross_sales || 0),
        net_sales: parseFloat(heroKpis.net_sales || 0),
        tax_total: parseFloat(heroKpis.tax_total || 0),
        total_tips: parseFloat(heroKpis.total_tips || 0),
        total_discounts: parseFloat(heroKpis.total_discounts || 0),
        total_delivery_fees: parseFloat(heroKpis.total_delivery_fees || 0),
        total_tickets: parseInt(heroKpis.total_tickets || 0),
        avg_ticket: parseFloat(heroKpis.avg_ticket || 0),
        occupancy_rate: occupancyRate,
        total_tables: totalT,
        occupied_tables: occupiedT
      },
      live: {
        open_orders_value: parseFloat(openOrdersValue?.total || 0),
        open_orders_count: parseInt(openOrdersValue?.count || 0),
        avg_prep_time_mins: avgPrepTime
      },
      currentShift,
      payments,
      channels,
      voids: {
        count: parseInt(voidTracking?.count || 0),
        total: parseFloat(voidTracking?.total || 0)
      },
      products: { 
        top: topProducts, 
        worst: worstProducts, 
        categories: categoryBreakdown 
      },
      staff: staffPerformance,
      hourlySales,
      dailySales,
      topCustomers,
      lowStockSupplies
    });
  } catch (err) {
    console.error('Error al generar métricas del dashboard:', err);
    res.status(500).json({ error: 'Error al consultar datos analíticos del dashboard' });
  }
};
