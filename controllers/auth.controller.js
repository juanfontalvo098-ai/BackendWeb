const db = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  try {
    user.permissions = user.permissions ? JSON.parse(user.permissions) : null;
  } catch (e) {
    user.permissions = null;
  }

  const payload = { id: user.id, username: user.username, role: user.role };
  
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '24h' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' });

  delete user.password_hash;
  res.json({ user, accessToken, refreshToken });
};

exports.refreshToken = (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'El refresh token es requerido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const payload = { id: decoded.id, username: decoded.username, role: decoded.role };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '15m' });
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Sesión cerrada correctamente' });
};
