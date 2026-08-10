const db = require('../database/connection');

exports.getAll = (req, res) => {
  try {
    const invoices = db.prepare(`
      SELECT i.*, 
             u_cashier.full_name as cashier_name,
             u_waiter.full_name as waiter_name,
             t.table_number
      FROM invoices i
      JOIN users u_cashier ON i.user_id = u_cashier.id
      JOIN orders o ON i.order_id = o.id
      JOIN users u_waiter ON o.user_id = u_waiter.id
      JOIN tables_restaurant t ON o.table_id = t.id
      ORDER BY i.id DESC
    `).all();

    invoices.forEach(inv => {
      inv.items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(inv.order_id);
    });

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar historial de facturas' });
  }
};

exports.getById = (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, 
             u_cashier.full_name as cashier_name,
             u_waiter.full_name as waiter_name,
             t.table_number
      FROM invoices i
      JOIN users u_cashier ON i.user_id = u_cashier.id
      JOIN orders o ON i.order_id = o.id
      JOIN users u_waiter ON o.user_id = u_waiter.id
      JOIN tables_restaurant t ON o.table_id = t.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(invoice.order_id);
    res.json({ ...invoice, items });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar detalle de factura' });
  }
};

exports.getPrintFormat = (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, 
             u_cashier.full_name as cashier_name,
             u_waiter.full_name as waiter_name,
             t.table_number
      FROM invoices i
      JOIN users u_cashier ON i.user_id = u_cashier.id
      JOIN orders o ON i.order_id = o.id
      JOIN users u_waiter ON o.user_id = u_waiter.id
      JOIN tables_restaurant t ON o.table_id = t.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(invoice.order_id);
    res.json({ ...invoice, items });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar formato de impresión' });
  }
};

exports.create = (req, res) => {
  const { order_id, tip_percentage, custom_tip_amount, payment_method } = req.body;
  const user_id = req.user.id;

  const register = db.prepare('SELECT id FROM cash_registers WHERE user_id = ? AND status = "abierta"').get(user_id)
                || db.prepare('SELECT id FROM cash_registers WHERE status = "abierta" ORDER BY id DESC LIMIT 1').get();
  if (!register) return res.status(400).json({ error: 'Debes abrir una caja antes de poder facturar' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status === 'cerrada') return res.status(400).json({ error: 'La orden ya está cerrada' });

  const items = db.prepare('SELECT quantity, unit_price, tax_rate, tax_included FROM order_items WHERE order_id = ?').all(order_id);
  if (items.length === 0) return res.status(400).json({ error: 'La orden no tiene ítems' });

  let subtotal = 0;
  let tax_total = 0;

  items.forEach(item => {
    const rate = item.tax_rate || 0;
    const lineTotal = item.quantity * item.unit_price;
    if (item.tax_included && rate > 0) {
      const itemSub = lineTotal / (1 + rate);
      subtotal += itemSub;
      tax_total += (lineTotal - itemSub);
    } else if (!item.tax_included && rate > 0) {
      subtotal += lineTotal;
      tax_total += (lineTotal * rate);
    } else {
      subtotal += lineTotal;
    }
  });

  const total_before_tip = subtotal + tax_total;

  let tip_amount = 0;
  if (custom_tip_amount !== undefined && custom_tip_amount !== null && parseFloat(custom_tip_amount) >= 0) {
    tip_amount = parseFloat(custom_tip_amount);
  } else {
    tip_amount = total_before_tip * (tip_percentage || 0);
  }

  const total = total_before_tip + tip_amount;

  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const randStr = Math.floor(1000 + Math.random() * 9000);
  const invoice_number = `POS-${dateStr}-${randStr}`;

  const runTx = db.transaction(() => {
    const invoiceInfo = db.prepare('INSERT INTO invoices (order_id, cash_register_id, user_id, subtotal, tax_total, tip_percentage, tip_amount, total, payment_method, invoice_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(order_id, register.id, user_id, subtotal, tax_total, tip_percentage || 0, tip_amount, total, payment_method, invoice_number);
    
    db.prepare('INSERT INTO cash_movements (cash_register_id, type, amount, payment_method, description) VALUES (?, ?, ?, ?, ?)')
      .run(register.id, 'venta', total, payment_method, `Factura ${invoice_number}`);
      
    db.prepare('UPDATE orders SET status = "cerrada", updated_at = datetime("now") WHERE id = ?').run(order_id);
    db.prepare('UPDATE tables_restaurant SET status = "libre" WHERE id = ?').run(order.table_id);
    
    return invoiceInfo.lastInsertRowid;
  });

  try {
    const invoiceId = runTx();
    if (req.app.locals.io) {
      req.app.locals.io.emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
      req.app.locals.io.emit('order:updated', { order_id });
    }
    
    const invoice = db.prepare(`
      SELECT i.*, 
             u_cashier.full_name as cashier_name,
             u_waiter.full_name as waiter_name,
             t.table_number
      FROM invoices i
      JOIN users u_cashier ON i.user_id = u_cashier.id
      JOIN orders o ON i.order_id = o.id
      JOIN users u_waiter ON o.user_id = u_waiter.id
      JOIN tables_restaurant t ON o.table_id = t.id
      WHERE i.id = ?
    `).get(invoiceId);

    const invoiceItems = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(order_id);

    res.status(201).json({ ...invoice, items: invoiceItems });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar factura', details: err.message });
  }
};

exports.remove = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  const runTx = db.transaction(() => {
    // Delete cash movement generated by this invoice
    db.prepare('DELETE FROM cash_movements WHERE cash_register_id = ? AND description LIKE ?')
      .run(invoice.cash_register_id, `%Factura ${invoice.invoice_number}%`);

    // Reset order status to cancelada
    db.prepare('UPDATE orders SET status = "cancelada", notes = ? WHERE id = ?')
      .run(reason ? `Factura Anulada: ${reason}` : 'Factura Anulada/Eliminada', invoice.order_id);

    // Delete invoice
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  });

  try {
    runTx();
    if (req.app.locals.io) {
      req.app.locals.io.emit('order:updated', { order_id: invoice.order_id });
    }
    res.json({ message: 'Factura eliminada / anulada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar factura:', err);
    res.status(500).json({ error: 'Error al eliminar la factura' });
  }
};
