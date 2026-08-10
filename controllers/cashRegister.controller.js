const db = require('../database/connection');

exports.open = (req, res) => {
  const { opening_amount } = req.body;
  const user_id = req.user.id;

  const current = db.prepare('SELECT id FROM cash_registers WHERE status = "abierta"').get();
  if (current) return res.status(400).json({ error: 'Ya existe una caja abierta en el sistema' });

  try {
    const info = db.prepare('INSERT INTO cash_registers (user_id, opening_amount) VALUES (?, ?)').run(user_id, opening_amount);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Caja abierta exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al abrir caja' });
  }
};

exports.getCurrent = (req, res) => {
  const register = db.prepare('SELECT * FROM cash_registers WHERE user_id = ? AND status = "abierta"').get(req.user.id)
                || db.prepare('SELECT * FROM cash_registers WHERE status = "abierta" ORDER BY id DESC LIMIT 1').get();
  if (!register) return res.status(404).json({ error: 'No hay caja abierta' });
  res.json(register);
};

exports.addMovement = (req, res) => {
  const { type, amount, payment_method, description } = req.body;
  const register = db.prepare('SELECT id FROM cash_registers WHERE user_id = ? AND status = "abierta"').get(req.user.id)
                || db.prepare('SELECT id FROM cash_registers WHERE status = "abierta" ORDER BY id DESC LIMIT 1').get();
  if (!register) return res.status(400).json({ error: 'Debes abrir una caja primero' });

  try {
    const info = db.prepare('INSERT INTO cash_movements (cash_register_id, type, amount, payment_method, description) VALUES (?, ?, ?, ?, ?)')
      .run(register.id, type, amount, payment_method || 'efectivo', description || null);
    res.json({ id: info.lastInsertRowid, message: 'Movimiento registrado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
};

exports.getShiftSummary = (req, res) => {
  try {
    const register = db.prepare('SELECT * FROM cash_registers WHERE user_id = ? AND status = "abierta"').get(req.user.id)
                  || db.prepare('SELECT * FROM cash_registers WHERE status = "abierta" ORDER BY id DESC LIMIT 1').get();
    if (!register) return res.status(404).json({ error: 'No hay caja abierta' });

    // Invoices breakdown
    const invoices = db.prepare('SELECT payment_method, subtotal, tax_total, tip_amount, total FROM invoices WHERE cash_register_id = ?').all(register.id);
    
    let cashSales = 0, cardSales = 0, transferSales = 0, creditSales = 0;
    let totalTips = 0;

    invoices.forEach(inv => {
      totalTips += (inv.tip_amount || 0);
      if (inv.payment_method === 'efectivo') cashSales += inv.total;
      else if (inv.payment_method === 'tarjeta') cardSales += inv.total;
      else if (inv.payment_method === 'transferencia') transferSales += inv.total;
      else if (inv.payment_method === 'credito') creditSales += inv.total;
      else cashSales += inv.total;
    });

    // Movements breakdown
    const movements = db.prepare('SELECT type, amount, payment_method FROM cash_movements WHERE cash_register_id = ?').all(register.id);
    
    let cashInflows = 0, cashOutflows = 0, cashRefunds = 0;
    movements.forEach(m => {
      if (m.type === 'ingreso' && m.payment_method === 'efectivo') cashInflows += m.amount;
      if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') cashOutflows += m.amount;
      if (m.type === 'devolucion' && m.payment_method === 'efectivo') cashRefunds += m.amount;
    });

    // Audit / Security: Canceled orders and deleted items
    const auditRow = db.prepare(`
      SELECT 
        COALESCE(COUNT(DISTINCT o.id), 0) as canceled_orders_count,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as canceled_amount
      FROM orders o 
      JOIN order_items oi ON o.id = oi.order_id 
      WHERE o.status = "cancelada" AND DATE(o.updated_at) = DATE("now")
    `).get();

    const initialFloat = register.opening_amount || 0;
    
    // Strict formula: Expected Cash = (Initial Float + Cash Sales + Cash Inflows) - (Cash Outflows + Refunds paid in cash)
    const expectedCash = (initialFloat + cashSales + cashInflows) - (cashOutflows + cashRefunds);

    res.json({
      cash_register_id: register.id,
      user_id: register.user_id,
      opened_at: register.opened_at,
      initialFloat,
      cashSales,
      cashInflows,
      cashOutflows,
      cashRefunds,
      expectedCash,
      cardSales,
      transferSales,
      creditSales,
      totalTips,
      audit: {
        canceledOrdersCount: auditRow?.canceled_orders_count || 0,
        canceledAmount: auditRow?.canceled_amount || 0
      }
    });
  } catch (err) {
    console.error('Error al obtener resumen de turno:', err);
    res.status(500).json({ error: 'Error al calcular resumen de turno' });
  }
};

exports.close = (req, res) => {
  const { closing_amount } = req.body;
  const register = db.prepare('SELECT * FROM cash_registers WHERE user_id = ? AND status = "abierta"').get(req.user.id)
                || db.prepare('SELECT * FROM cash_registers WHERE status = "abierta" ORDER BY id DESC LIMIT 1').get();
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });

  // Invoices breakdown
  const invoices = db.prepare(`
    SELECT i.*, o.table_id, t.table_number, u.full_name as waiter_name
    FROM invoices i
    JOIN orders o ON i.order_id = o.id
    JOIN tables_restaurant t ON o.table_id = t.id
    JOIN users u ON o.user_id = u.id
    WHERE i.cash_register_id = ?
  `).all(register.id);

  let grossRevenue = 0, netRevenue = 0, taxTotal = 0, totalTips = 0;
  let cashSales = 0, cardSales = 0, transferSales = 0, creditSales = 0;

  invoices.forEach(inv => {
    grossRevenue += inv.total;
    netRevenue += inv.subtotal;
    taxTotal += inv.tax_total;
    totalTips += (inv.tip_amount || 0);

    if (inv.payment_method === 'efectivo') cashSales += inv.total;
    else if (inv.payment_method === 'tarjeta') cardSales += inv.total;
    else if (inv.payment_method === 'transferencia') transferSales += inv.total;
    else if (inv.payment_method === 'credito') creditSales += inv.total;
    else cashSales += inv.total;
  });

  const movements = db.prepare('SELECT type, amount, payment_method, description, created_at FROM cash_movements WHERE cash_register_id = ?').all(register.id);
  
  let cashInflows = 0, cashOutflows = 0, cashRefunds = 0;
  movements.forEach(m => {
    if (m.type === 'ingreso' && m.payment_method === 'efectivo') cashInflows += m.amount;
    if ((m.type === 'egreso' || m.type === 'retiro') && m.payment_method === 'efectivo') cashOutflows += m.amount;
    if (m.type === 'devolucion' && m.payment_method === 'efectivo') cashRefunds += m.amount;
  });

  // Strict Expected Cash Formula
  const expected = (register.opening_amount + cashSales + cashInflows) - (cashOutflows + cashRefunds);
  const difference = closing_amount - expected;

  try {
    db.prepare('UPDATE cash_registers SET closing_amount = ?, expected_amount = ?, difference = ?, status = "cerrada", closed_at = datetime("now") WHERE id = ?')
      .run(closing_amount, expected, difference, register.id);

    const cashier = db.prepare('SELECT full_name FROM users WHERE id = ?').get(register.user_id);

    const voidRow = db.prepare('SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.status = "cancelada" AND DATE(o.updated_at) = DATE("now")').get();
    const totalVoids = voidRow?.total || 0;

    const itemizedSales = db.prepare(`
      SELECT p.name as product_name, c.name as category_name, SUM(oi.quantity) as quantity, SUM(oi.quantity * oi.unit_price) as total_sales, AVG(oi.unit_price) as unit_price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN invoices i ON oi.order_id = i.order_id
      WHERE i.cash_register_id = ?
      GROUP BY p.id
    `).all(register.id);

    const snapshot = {
      invoices,
      itemizedSales,
      movements
    };

    const hour = new Date().getHours();
    const shiftName = hour < 15 ? 'Jornada Mañana' : 'Jornada Tarde / Noche';

    try {
      db.prepare(`
        INSERT INTO shift_reports (
          cash_register_id, user_id, user_name, shift_name, opened_at, closed_at,
          opening_amount, closing_amount, expected_amount, difference,
          gross_revenue, net_revenue, tax_total, total_tips, total_tickets,
          cash_sales, card_sales, transfer_sales, total_withdrawals, total_voids, snapshot_json
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        register.id, register.user_id, cashier?.full_name || 'Cajero', shiftName, register.opened_at,
        register.opening_amount, closing_amount, expected, difference,
        grossRevenue, netRevenue, taxTotal, totalTips, invoices.length,
        cashSales, cardSales, transferSales, cashOutflows, totalVoids, JSON.stringify(snapshot)
      );
    } catch (e) {
      console.error('Error al insertar snapshot shift_report:', e);
    }

    res.json({ message: 'Caja cerrada y Reporte Z guardado exitosamente', expected, difference });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar caja' });
  }
};

exports.getReport = (req, res) => {
  const { id } = req.params;
  const register = db.prepare('SELECT * FROM cash_registers WHERE id = ?').get(id);
  if (!register) return res.status(404).json({ error: 'Caja no encontrada' });

  const movements = db.prepare('SELECT type, payment_method, SUM(amount) as total FROM cash_movements WHERE cash_register_id = ? GROUP BY type, payment_method').all(id);
  
  res.json({ register, movements });
};
