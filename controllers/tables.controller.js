const db = require('../database/connection');

exports.getAll = (req, res) => {
  const tables = db.prepare('SELECT * FROM tables_restaurant').all();
  const tablesWithOrders = tables.map(table => {
    const order = db.prepare('SELECT * FROM orders WHERE table_id = ? AND status IN ("abierta", "en_preparacion", "lista") ORDER BY id DESC LIMIT 1').get(table.id);
    if (order) {
      const itemsCount = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE order_id = ?').get(order.id).count;
      if (itemsCount === 0 && order.status === 'abierta') {
        // Si la comanda no tiene productos, la mesa se considera LIBRE / DISPONIBLE
        table.status = 'libre';
        table.current_order = null;
      } else {
        table.current_order = order;
      }
    } else {
      if (table.status !== 'pendiente_pago') {
        table.status = 'libre';
      }
      table.current_order = null;
    }
    return table;
  });
  res.json(tablesWithOrders);
};

exports.create = (req, res) => {
  const { table_number, capacity, zone } = req.body;
  if (!table_number) return res.status(400).json({ error: 'El nombre/número de mesa es requerido' });

  try {
    const info = db.prepare('INSERT INTO tables_restaurant (table_number, capacity, zone, status) VALUES (?, ?, ?, "libre")')
      .run(table_number, capacity || 4, zone || 'interior');
    
    if (req.app.locals.io) {
      req.app.locals.io.emit('table:status-changed', { table_id: info.lastInsertRowid, status: 'libre' });
    }
    res.status(201).json({ id: info.lastInsertRowid, message: 'Mesa creada exitosamente' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ya existe una mesa con este nombre/número' });
    }
    res.status(500).json({ error: 'Error al crear la mesa' });
  }
};

exports.updateTable = (req, res) => {
  const { table_number, capacity, zone, status } = req.body;
  const { id } = req.params;

  try {
    db.prepare('UPDATE tables_restaurant SET table_number = ?, capacity = ?, zone = ?, status = ? WHERE id = ?')
      .run(table_number, capacity || 4, zone || 'interior', status || 'libre', id);

    if (req.app.locals.io) {
      req.app.locals.io.emit('table:status-changed', { table_id: id, status: status || 'libre' });
    }
    res.json({ message: 'Mesa actualizada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la mesa' });
  }
};

exports.deleteTable = (req, res) => {
  const { id } = req.params;
  const table = db.prepare('SELECT status FROM tables_restaurant WHERE id = ?').get(id);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
  if (table.status !== 'libre') return res.status(400).json({ error: 'No se puede eliminar una mesa ocupada o pendiente de pago' });

  try {
    db.prepare('DELETE FROM tables_restaurant WHERE id = ?').run(id);
    if (req.app.locals.io) {
      req.app.locals.io.emit('table:status-changed', { table_id: id, status: 'deleted' });
    }
    res.json({ message: 'Mesa eliminada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la mesa' });
  }
};

exports.updateStatus = (req, res) => {
  const { status } = req.body;
  if (!['libre', 'ocupada', 'pendiente_pago'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  
  db.prepare('UPDATE tables_restaurant SET status = ? WHERE id = ?').run(status, req.params.id);
  
  if (req.app.locals.io) {
    req.app.locals.io.emit('table:status-changed', { table_id: req.params.id, status });
  }
  
  res.json({ message: 'Estado de mesa actualizado' });
};
