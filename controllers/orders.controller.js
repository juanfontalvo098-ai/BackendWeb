const db = require('../database/connection');

exports.getAll = (req, res) => {
  const { status, table_id } = req.query;
  let sql = 'SELECT o.*, t.table_number, u.full_name as waiter_name FROM orders o JOIN tables_restaurant t ON o.table_id = t.id JOIN users u ON o.user_id = u.id WHERE 1=1';
  let params = [];

  if (status) {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  if (table_id) {
    sql += ' AND o.table_id = ?';
    params.push(table_id);
  }

  const orders = db.prepare(sql).all(...params);
  
  orders.forEach(order => {
    order.items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(order.id);
  });

  res.json(orders);
};

exports.getById = (req, res) => {
  const order = db.prepare('SELECT o.*, t.table_number, u.full_name as waiter_name FROM orders o JOIN tables_restaurant t ON o.table_id = t.id JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  order.items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(order.id);
  res.json(order);
};

exports.create = (req, res) => {
  const { table_id, guests, notes } = req.body;
  const user_id = req.user.id;

  const table = db.prepare('SELECT status FROM tables_restaurant WHERE id = ?').get(table_id);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

  const existingOrder = db.prepare('SELECT id FROM orders WHERE table_id = ? AND status IN ("abierta", "enviado_cocina", "en_preparacion", "lista", "pendiente_pago") ORDER BY id DESC LIMIT 1').get(table_id);
  if (existingOrder) {
    return res.status(200).json({ id: existingOrder.id, message: 'Orden existente recuperada' });
  }

  try {
    const info = db.prepare('INSERT INTO orders (table_id, user_id, guests, notes) VALUES (?, ?, ?, ?)').run(table_id, user_id, guests || 1, notes || null);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Orden creada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear la orden' });
  }
};

exports.addItems = (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const order = db.prepare('SELECT status, table_id FROM orders WHERE id = ?').get(id);
  if (!order || ['cerrada', 'cancelada'].includes(order.status)) {
    return res.status(400).json({ error: 'La orden no se puede modificar' });
  }

  const runTx = db.transaction(() => {
    const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_rate, tax_included, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (let item of items) {
      const product = db.prepare('SELECT price, tax_rate, tax_included FROM products WHERE id = ?').get(item.product_id);
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);
      const priceToUse = (item.unit_price !== undefined && item.unit_price !== null && !isNaN(parseFloat(item.unit_price)))
        ? parseFloat(item.unit_price) 
        : product.price;

      stmt.run(id, item.product_id, item.quantity, priceToUse, product.tax_rate, product.tax_included, item.notes || null);
    }
    db.prepare('UPDATE orders SET updated_at = datetime("now") WHERE id = ?').run(id);
    db.prepare('UPDATE tables_restaurant SET status = "ocupada" WHERE id = ?').run(order.table_id);
  });

  try {
    runTx();
    if (req.app.locals.io) {
      req.app.locals.io.emit('order:updated', { order_id: id });
      req.app.locals.io.emit('table:status-changed', { table_id: order.table_id, status: 'ocupada' });
    }
    res.json({ message: 'Ítems agregados a la orden' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al agregar ítems' });
  }
};

exports.removeItem = (req, res) => {
  const item = db.prepare('SELECT order_id FROM order_items WHERE id = ?').get(req.params.itemId);
  if (item) {
    db.prepare('DELETE FROM order_items WHERE id = ? AND status = "pendiente"').run(req.params.itemId);
    
    const remainingCount = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE order_id = ?').get(item.order_id).count;
    const order = db.prepare('SELECT table_id, status FROM orders WHERE id = ?').get(item.order_id);
    
    if (remainingCount === 0 && order && order.status === 'abierta') {
      db.prepare('UPDATE tables_restaurant SET status = "libre" WHERE id = ?').run(order.table_id);
      if (req.app.locals.io) {
        req.app.locals.io.emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
      }
    }
  }
  res.json({ message: 'Ítem eliminado' });
};

exports.updateItemQuantity = (req, res) => {
  const { quantity } = req.body;
  const result = db.prepare('UPDATE order_items SET quantity = ? WHERE id = ? AND status = "pendiente"').run(quantity, req.params.itemId);
  if (result.changes === 0) return res.status(400).json({ error: 'No se puede modificar este ítem' });
  res.json({ message: 'Cantidad actualizada' });
};

exports.sendToKitchen = (req, res) => {
  const { id } = req.params;

  const order = db.prepare('SELECT o.*, t.table_number FROM orders o JOIN tables_restaurant t ON o.table_id = t.id WHERE o.id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  const pendingItems = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ? AND oi.status = "pendiente"').all(id);

  if (pendingItems.length === 0) {
    return res.status(400).json({ error: 'No hay ítems nuevos pendientes para enviar a cocina' });
  }

  const itemsJson = JSON.stringify(pendingItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes })));

  const runTx = db.transaction(() => {
    db.prepare('INSERT INTO kitchen_tickets (order_id, table_number, items_json) VALUES (?, ?, ?)').run(id, order.table_number, itemsJson);
    db.prepare('UPDATE order_items SET status = "enviado_cocina", sent_to_kitchen_at = datetime("now") WHERE order_id = ? AND status = "pendiente"').run(id);
    db.prepare('UPDATE orders SET status = "en_preparacion", updated_at = datetime("now") WHERE id = ?').run(id);
    db.prepare('UPDATE tables_restaurant SET status = "ocupada" WHERE id = ?').run(order.table_id);
  });

  try {
    runTx();
    if (req.app.locals.io) {
      req.app.locals.io.emit('kitchen:new-ticket', { order_id: id, table_number: order.table_number });
      req.app.locals.io.emit('table:status-changed', { table_id: order.table_id, status: 'ocupada' });
      req.app.locals.io.emit('order:updated', { order_id: id });
    }
    res.json({ message: 'Comanda enviada a cocina exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar a cocina', details: err.message });
  }
};

exports.cancelOrder = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const order = db.prepare('SELECT table_id, status FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status === 'cerrada') return res.status(400).json({ error: 'La orden ya está cerrada y facturada' });

  const runTx = db.transaction(() => {
    db.prepare('UPDATE orders SET status = "cancelada", notes = ?, updated_at = datetime("now") WHERE id = ?')
      .run(reason ? `Cancelada: ${reason}` : 'Anulada por el usuario', id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
    db.prepare('DELETE FROM kitchen_tickets WHERE order_id = ?').run(id);
    db.prepare('UPDATE tables_restaurant SET status = "libre" WHERE id = ?').run(order.table_id);
  });

  try {
    runTx();
    if (req.app.locals.io) {
      req.app.locals.io.emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
      req.app.locals.io.emit('order:updated', { order_id: id });
    }
    res.json({ message: 'Orden cancelada / anulada exitosamente' });
  } catch (err) {
    console.error('Error al cancelar la orden:', err);
    res.status(500).json({ error: 'Error al cancelar la orden' });
  }
};

exports.updateStatus = (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  try {
    db.prepare('UPDATE orders SET status = ?, updated_at = datetime("now") WHERE id = ?').run(status, id);
    if (req.app.locals.io) {
      req.app.locals.io.emit('order:updated', { order_id: id });
    }
    res.json({ message: 'Estado de la orden actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado de la orden' });
  }
};

exports.updateItemStatus = (req, res) => {
  const { status } = req.body;
  const { itemId } = req.params;
  try {
    db.prepare('UPDATE order_items SET status = ? WHERE id = ?').run(status, itemId);
    res.json({ message: 'Estado de ítem de orden actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado del ítem' });
  }
};
