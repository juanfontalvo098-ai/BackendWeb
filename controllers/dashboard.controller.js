const db = require('../database/connection');

exports.getMetrics = (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let dateCondition = "WHERE DATE(i.created_at) = DATE('now')";
    let orderDateCondition = "WHERE DATE(o.created_at) = DATE('now')";

    if (period === 'yesterday') {
      dateCondition = "WHERE DATE(i.created_at) = DATE('now', '-1 day')";
      orderDateCondition = "WHERE DATE(o.created_at) = DATE('now', '-1 day')";
    } else if (period === 'last7') {
      dateCondition = "WHERE DATE(i.created_at) >= DATE('now', '-7 days')";
      orderDateCondition = "WHERE DATE(o.created_at) >= DATE('now', '-7 days')";
    } else if (period === 'month') {
      dateCondition = "WHERE strftime('%Y-%m', i.created_at) = strftime('%Y-%m', 'now')";
      orderDateCondition = "WHERE strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')";
    } else if (period === 'custom' && startDate && endDate) {
      dateCondition = `WHERE DATE(i.created_at) BETWEEN DATE('${startDate}') AND DATE('${endDate}')`;
      orderDateCondition = `WHERE DATE(o.created_at) BETWEEN DATE('${startDate}') AND DATE('${endDate}')`;
    }

    // 1. Hero KPIs
    const heroKpis = db.prepare(`
      SELECT 
        COALESCE(SUM(total), 0) as gross_sales,
        COALESCE(SUM(subtotal), 0) as net_sales,
        COALESCE(SUM(tax_total), 0) as tax_total,
        COALESCE(SUM(tip_amount), 0) as total_tips,
        COUNT(id) as total_tickets,
        COALESCE(AVG(total), 0) as avg_ticket
      FROM invoices i
      ${dateCondition}
    `).get();

    // Ocupación de Mesas
    const totalTables = db.prepare('SELECT COUNT(*) as count FROM tables_restaurant').get().count || 1;
    const occupiedTables = db.prepare('SELECT COUNT(*) as count FROM tables_restaurant WHERE status IN ("ocupada", "pendiente_pago")').get().count || 0;
    const occupancyRate = ((occupiedTables / totalTables) * 100).toFixed(1);

    // 2. Live Operational Heatmap
    const openOrdersValue = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status IN ('abierta', 'en_preparacion', 'lista')
    `).get().total || 0;

    // Tiempo promedio de preparación en cocina (en minutos)
    const avgPrepTimeRow = db.prepare(`
      SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24 * 60) as avg_mins
      FROM kitchen_tickets
      WHERE completed_at IS NOT NULL
    `).get();
    const avgPrepTime = avgPrepTimeRow?.avg_mins ? Math.round(avgPrepTimeRow.avg_mins) : 12;

    // 3. Payment Breakdown (Donut Chart Data)
    const payments = db.prepare(`
      SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(id) as count
      FROM invoices i
      ${dateCondition}
      GROUP BY payment_method
    `).all();

    // Void & Discount Tracking (Órdenes canceladas)
    const voidTracking = db.prepare(`
      SELECT COUNT(o.id) as count, COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status = 'cancelada'
    `).get();

    // 4. Product Analytics (Top Best Sellers, Worst Sellers, Category Breakdown)
    const topProducts = db.prepare(`
      SELECT p.name, SUM(oi.quantity) as volume, SUM(oi.quantity * oi.unit_price) as total_sales
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN invoices i ON oi.order_id = i.order_id
      ${dateCondition}
      GROUP BY p.id
      ORDER BY total_sales DESC
      LIMIT 5
    `).all();

    const worstProducts = db.prepare(`
      SELECT p.name, COALESCE(SUM(oi.quantity), 0) as volume, COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY volume ASC
      LIMIT 5
    `).all();

    const categoryBreakdown = db.prepare(`
      SELECT c.name as category_name, COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales, COUNT(oi.id) as item_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY c.id
    `).all();

    // 5. Staff Performance (Waitstaff Leaderboard)
    const staffPerformance = db.prepare(`
      SELECT 
        u.full_name as waiter_name,
        COUNT(DISTINCT i.id) as tickets_handled,
        COALESCE(SUM(i.total), 0) as total_sales,
        COALESCE(SUM(i.tip_amount), 0) as total_tips
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN invoices i ON o.id = i.order_id
      ${dateCondition}
      GROUP BY u.id
      ORDER BY total_sales DESC
    `).all();

    // 6. Hourly Sales Trend (Chart)
    const hourlySales = db.prepare(`
      SELECT strftime('%H:00', i.created_at) as hour, COALESCE(SUM(i.total), 0) as total
      FROM invoices i
      ${dateCondition}
      GROUP BY hour
      ORDER BY hour ASC
    `).all();

    res.json({
      period: period || 'today',
      kpis: {
        gross_sales: heroKpis.gross_sales,
        net_sales: heroKpis.net_sales,
        tax_total: heroKpis.tax_total,
        total_tips: heroKpis.total_tips,
        total_tickets: heroKpis.total_tickets,
        avg_ticket: heroKpis.avg_ticket,
        occupancy_rate: occupancyRate,
        total_tables: totalTables,
        occupied_tables: occupiedTables
      },
      live: {
        open_orders_value: openOrdersValue,
        avg_prep_time_mins: avgPrepTime
      },
      payments,
      voids: voidTracking,
      products: {
        top: topProducts,
        worst: worstProducts,
        categories: categoryBreakdown
      },
      staff: staffPerformance,
      hourlySales
    });
  } catch (err) {
    console.error('Error al generar métricas del dashboard:', err);
    res.status(500).json({ error: 'Error al consultar datos analíticos del dashboard' });
  }
};
