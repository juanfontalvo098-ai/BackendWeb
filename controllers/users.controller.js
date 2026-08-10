const db = require('../database/connection');
const bcrypt = require('bcryptjs');

exports.getAll = (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, full_name, role, is_active, permissions, created_at FROM users').all();
    users.forEach(u => {
      try {
        u.permissions = u.permissions ? JSON.parse(u.permissions) : null;
      } catch (e) {
        u.permissions = null;
      }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener lista de usuarios' });
  }
};

exports.create = (req, res) => {
  const { username, password, full_name, role, permissions } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'El nombre de usuario ya se encuentra registrado' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const permsStr = Array.isArray(permissions) ? JSON.stringify(permissions) : null;
    const info = db.prepare('INSERT INTO users (username, password_hash, full_name, role, permissions) VALUES (?, ?, ?, ?, ?)')
      .run(username, hash, full_name, role, permsStr);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Usuario creado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el usuario en la base de datos' });
  }
};

exports.update = (req, res) => {
  const { id } = req.params;
  const { full_name, role, is_active, password, permissions } = req.body;
  try {
    const permsStr = Array.isArray(permissions) ? JSON.stringify(permissions) : null;
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET full_name = ?, role = ?, is_active = ?, permissions = ?, password_hash = ?, updated_at = datetime("now") WHERE id = ?')
        .run(full_name, role, is_active, permsStr, hash, id);
    } else {
      db.prepare('UPDATE users SET full_name = ?, role = ?, is_active = ?, permissions = ?, updated_at = datetime("now") WHERE id = ?')
        .run(full_name, role, is_active, permsStr, id);
    }
    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar información del usuario' });
  }
};

exports.remove = (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    res.json({ message: 'Usuario desactivado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el usuario' });
  }
};

exports.deleteUser = (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'Usuario eliminado definitivamente de la base de datos' });
  } catch (err) {
    res.status(400).json({ error: 'No se puede eliminar un usuario con transacciones asociadas. Te recomendamos desactivarlo.' });
  }
};
