/**
 * Middleware de Autenticación — JWT Multi-tenant
 * 
 * Decodifica el JWT y extrae:
 * - id, username, role (existentes)
 * - businessId, branchId, branchIds (nuevos para multi-tenant)
 * 
 * Inyecta req.user con todos estos campos.
 */
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Falta el token de autorización' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Inyectar datos del usuario + contexto multi-tenant
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      businessId: decoded.businessId || null,
      branchId: decoded.branchId || null,
      branchIds: decoded.branchIds || []
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = auth;
