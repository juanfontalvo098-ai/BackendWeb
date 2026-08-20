/**
 * Advanced Reports Controller — Multi-tenant
 * Reportes avanzados: inventario, márgenes, comparativos, clientes, CxC/CxP
 */
const knex = require('../database/knex');

// Reporte de inventario: valorización, rotación
exports.getInventoryReport = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('inventory as inv')
      .join('products as p', 'inv.product_id', 'p.id')
      .join('categories as c', 'p.category_id', 'c.id')
      .select(
        'p.id as product_id', 'p.name as product_name', 'p.sku', 'p.cost_price', 'p.price',
        'p.unit_of_measure', 'p.min_stock', 'c.name as category_name',
        knex.raw('SUM(inv.quantity) as total_quantity'),
        knex.raw('SUM(inv.quantity * COALESCE(p.cost_price, 0)) as total_cost_value'),
        knex.raw('SUM(inv.quantity * p.price) as total_sale_value')
      )
      .where('inv.business_id', businessId)
      .andWhere('p.track_inventory', true)
      .groupBy('p.id', 'p.name', 'p.sku', 'p.cost_price', 'p.price', 'p.unit_of_measure', 'p.min_stock', 'c.name');

    if (branchId && !isGlobalScope) query.andWhere('inv.branch_id', branchId);

    const items = await query.orderBy('c.name').orderBy('p.name');

    const totals = items.reduce((acc, item) => {
      acc.totalQty += parseFloat(item.total_quantity);
      acc.totalCostValue += parseFloat(item.total_cost_value);
      acc.totalSaleValue += parseFloat(item.total_sale_value);
      return acc;
    }, { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 });

    res.json({ items, totals });
  } catch (err) {
    console.error('Error en reporte de inventario:', err);
    res.status(500).json({ error: 'Error al generar reporte de inventario' });
  }
};

// Margen de ganancia por producto
exports.getProfitMarginReport = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { startDate, endDate } = req.query;

    let query = knex('order_items as oi')
      .join('invoices as i', 'oi.order_id', 'i.order_id')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('categories as c', 'p.category_id', 'c.id')
      .select(
        'p.id as product_id', 'p.name as product_name', 'c.name as category_name',
        'p.price', 'p.cost_price',
        knex.raw('SUM(oi.quantity) as units_sold'),
        knex.raw('SUM(oi.quantity * oi.unit_price) as total_revenue'),
        knex.raw('SUM(oi.quantity * COALESCE(p.cost_price, 0)) as total_cost'),
        knex.raw('SUM(oi.quantity * oi.unit_price) - SUM(oi.quantity * COALESCE(p.cost_price, 0)) as gross_profit')
      )
      .where('i.business_id', businessId)
      .groupBy('p.id', 'p.name', 'c.name', 'p.price', 'p.cost_price');

    if (branchId && !isGlobalScope) query.andWhere('i.branch_id', branchId);
    if (startDate && endDate) {
      query.whereRaw('DATE(i.created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const products = await query.orderBy('gross_profit', 'desc');

    // Calcular margen %
    products.forEach(p => {
      const revenue = parseFloat(p.total_revenue);
      p.margin_percentage = revenue > 0 ? ((parseFloat(p.gross_profit) / revenue) * 100).toFixed(1) : 0;
    });

    const totals = products.reduce((acc, p) => {
      acc.totalRevenue += parseFloat(p.total_revenue);
      acc.totalCost += parseFloat(p.total_cost);
      acc.totalProfit += parseFloat(p.gross_profit);
      return acc;
    }, { totalRevenue: 0, totalCost: 0, totalProfit: 0 });

    totals.overallMargin = totals.totalRevenue > 0
      ? ((totals.totalProfit / totals.totalRevenue) * 100).toFixed(1)
      : 0;

    res.json({ products, totals });
  } catch (err) {
    console.error('Error en reporte de márgenes:', err);
    res.status(500).json({ error: 'Error al generar reporte de márgenes' });
  }
};

// Comparativo de períodos
exports.getPeriodComparison = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { period1Start, period1End, period2Start, period2End } = req.query;

    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ error: 'Se requieren ambos períodos para comparar' });
    }

    const getMetrics = async (startDate, endDate) => {
      let query = knex('invoices as i')
        .where('i.business_id', businessId);
      if (branchId && !isGlobalScope) query.andWhere('i.branch_id', branchId);
      query.whereRaw('DATE(i.created_at) BETWEEN ? AND ?', [startDate, endDate]);

      return query.select(
        knex.raw('COALESCE(SUM(i.total), 0) as gross_sales'),
        knex.raw('COALESCE(SUM(i.subtotal), 0) as net_sales'),
        knex.raw('COALESCE(SUM(i.tax_total), 0) as taxes'),
        knex.raw('COALESCE(SUM(i.tip_amount), 0) as tips'),
        knex.raw('COALESCE(SUM(i.discount_amount), 0) as discounts'),
        knex.raw('COUNT(i.id) as total_tickets'),
        knex.raw('COALESCE(AVG(i.total), 0) as avg_ticket')
      ).first();
    };

    const period1 = await getMetrics(period1Start, period1End);
    const period2 = await getMetrics(period2Start, period2End);

    // Calcular variación %
    const calcChange = (current, previous) => {
      const c = parseFloat(current || 0);
      const p = parseFloat(previous || 0);
      if (p === 0) return c > 0 ? 100 : 0;
      return (((c - p) / p) * 100).toFixed(1);
    };

    res.json({
      period1: { dates: { start: period1Start, end: period1End }, metrics: period1 },
      period2: { dates: { start: period2Start, end: period2End }, metrics: period2 },
      changes: {
        gross_sales: calcChange(period2.gross_sales, period1.gross_sales),
        net_sales: calcChange(period2.net_sales, period1.net_sales),
        total_tickets: calcChange(period2.total_tickets, period1.total_tickets),
        avg_ticket: calcChange(period2.avg_ticket, period1.avg_ticket)
      }
    });
  } catch (err) {
    console.error('Error en comparativo:', err);
    res.status(500).json({ error: 'Error al generar comparativo' });
  }
};

// Reporte de clientes top
exports.getCustomerReport = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate, limit } = req.query;

    let query = knex('invoices as i')
      .join('customers as c', 'i.customer_id', 'c.id')
      .select(
        'c.id', 'c.name', 'c.customer_type', 'c.phone',
        knex.raw('COUNT(i.id) as total_purchases'),
        knex.raw('COALESCE(SUM(i.total), 0) as total_spent'),
        knex.raw('COALESCE(AVG(i.total), 0) as avg_ticket'),
        knex.raw('MAX(i.created_at) as last_purchase')
      )
      .where('i.business_id', businessId)
      .whereNotNull('i.customer_id')
      .groupBy('c.id', 'c.name', 'c.customer_type', 'c.phone')
      .orderBy('total_spent', 'desc')
      .limit(parseInt(limit) || 20);

    if (startDate && endDate) {
      query.whereRaw('DATE(i.created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const customers = await query;
    res.json(customers);
  } catch (err) {
    console.error('Error en reporte de clientes:', err);
    res.status(500).json({ error: 'Error al generar reporte de clientes' });
  }
};

// Dashboard multi-sucursal comparativo
exports.getBranchComparison = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate } = req.query;

    let query = knex('invoices as i')
      .join('branches as b', 'i.branch_id', 'b.id')
      .select(
        'b.id as branch_id', 'b.name as branch_name',
        knex.raw('COALESCE(SUM(i.total), 0) as gross_sales'),
        knex.raw('COUNT(i.id) as total_tickets'),
        knex.raw('COALESCE(AVG(i.total), 0) as avg_ticket'),
        knex.raw('COALESCE(SUM(i.tip_amount), 0) as total_tips')
      )
      .where('i.business_id', businessId)
      .groupBy('b.id', 'b.name')
      .orderBy('gross_sales', 'desc');

    if (startDate && endDate) {
      query.whereRaw('DATE(i.created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const branches = await query;
    res.json(branches);
  } catch (err) {
    console.error('Error en comparativo de sucursales:', err);
    res.status(500).json({ error: 'Error al generar comparativo' });
  }
};

// Reporte de descuentos aplicados
exports.getDiscountsReport = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate } = req.query;

    let query = knex('invoices')
      .where('business_id', businessId)
      .andWhere('discount_amount', '>', 0);

    if (startDate && endDate) {
      query.whereRaw('DATE(created_at) BETWEEN ? AND ?', [startDate, endDate]);
    }

    const summary = await query.select(
      knex.raw('COUNT(*) as invoices_with_discount'),
      knex.raw('COALESCE(SUM(discount_amount), 0) as total_discounted'),
      knex.raw('COALESCE(SUM(total), 0) as total_revenue_after_discount')
    ).first();

    res.json(summary);
  } catch (err) {
    console.error('Error en reporte de descuentos:', err);
    res.status(500).json({ error: 'Error al generar reporte de descuentos' });
  }
};
