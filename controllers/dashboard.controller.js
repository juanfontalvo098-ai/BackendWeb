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
      .select(knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total'));
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
      .groupBy('i.payment_method');
    addBranchFilter(paymentQuery, 'i');
    addDateFilter(paymentQuery, 'i.created_at');
    const payments = await paymentQuery;

    // Void Tracking
    let voidQuery = knex('orders as o')
      .leftJoin('order_items as oi', 'o.id', 'oi.order_id')
      .where('o.status', 'cancelada')
      .select(
        knex.raw('COUNT(DISTINCT o.id) as count'),
        knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total')
      );
    addBranchFilter(voidQuery, 'o');
    const voidTracking = await voidQuery.first();

    // 4. Product Analytics
    let topQuery = knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('invoices as i', 'oi.order_id', 'i.order_id')
      .select('p.name', knex.raw('SUM(oi.quantity) as volume'), knex.raw('SUM(oi.quantity * oi.unit_price) as total_sales'))
      .groupBy('p.id', 'p.name')
      .orderBy('total_sales', 'desc')
      .limit(5);
    topQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) topQuery.andWhere('i.branch_id', branchId);
    addDateFilter(topQuery, 'i.created_at');
    const topProducts = await topQuery;

    let worstQuery = knex('products as p')
      .leftJoin('order_items as oi', 'p.id', 'oi.product_id')
      .where('p.business_id', businessId)
      .select('p.name', knex.raw('COALESCE(SUM(oi.quantity), 0) as volume'), knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales'))
      .groupBy('p.id', 'p.name')
      .orderBy('volume', 'asc')
      .limit(5);
    const worstProducts = await worstQuery;

    let catQuery = knex('categories as c')
      .leftJoin('products as p', 'c.id', 'p.category_id')
      .leftJoin('order_items as oi', 'p.id', 'oi.product_id')
      .where('c.business_id', businessId)
      .select('c.name as category_name', knex.raw('COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales'), knex.raw('COUNT(oi.id) as item_count'))
      .groupBy('c.id', 'c.name');
    const categoryBreakdown = await catQuery;

    // 5. Staff Performance
    let staffQuery = knex('orders as o')
      .join('users as u', 'o.user_id', 'u.id')
      .join('invoices as i', 'o.id', 'i.order_id')
      .select(
        'u.full_name as waiter_name',
        knex.raw('COUNT(DISTINCT i.id) as tickets_handled'),
        knex.raw('COALESCE(SUM(i.total), 0) as total_sales'),
        knex.raw('COALESCE(SUM(i.tip_amount), 0) as total_tips')
      )
      .groupBy('u.id', 'u.full_name')
      .orderBy('total_sales', 'desc');
    staffQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) staffQuery.andWhere('i.branch_id', branchId);
    addDateFilter(staffQuery, 'i.created_at');
    const staffPerformance = await staffQuery;

    // 6. Hourly Sales Trend
    let hourlyQuery = knex('invoices as i')
      .select(
        knex.raw("TO_CHAR(i.created_at, 'HH24:00') as hour"),
        knex.raw('COALESCE(SUM(i.total), 0) as total')
      )
      .groupBy('hour')
      .orderBy('hour');
    hourlyQuery.where('i.business_id', businessId);
    if (branchId && !isGlobalScope) hourlyQuery.andWhere('i.branch_id', branchId);
    addDateFilter(hourlyQuery, 'i.created_at');
    const hourlySales = await hourlyQuery;

    res.json({
      period: period || 'today',
      kpis: {
        gross_sales: parseFloat(heroKpis.gross_sales),
        net_sales: parseFloat(heroKpis.net_sales),
        tax_total: parseFloat(heroKpis.tax_total),
        total_tips: parseFloat(heroKpis.total_tips),
        total_tickets: parseInt(heroKpis.total_tickets),
        avg_ticket: parseFloat(heroKpis.avg_ticket),
        occupancy_rate: occupancyRate,
        total_tables: totalT,
        occupied_tables: occupiedT
      },
      live: {
        open_orders_value: parseFloat(openOrdersValue?.total || 0),
        avg_prep_time_mins: avgPrepTime
      },
      payments,
      voids: voidTracking,
      products: { top: topProducts, worst: worstProducts, categories: categoryBreakdown },
      staff: staffPerformance,
      hourlySales
    });
  } catch (err) {
    console.error('Error al generar métricas del dashboard:', err);
    res.status(500).json({ error: 'Error al consultar datos analíticos del dashboard' });
  }
};
