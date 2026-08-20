/**
 * Middleware RBAC (Role-Based Access Control) — Expandido para multi-tenant
 * 
 * Roles soportados:
 * - super_admin: Acceso total a toda la plataforma
 * - admin: Administrador del negocio (todas las sucursales)
 * - gerente: Gerente de sucursal(es) asignadas
 * - cajero: Operaciones de caja en su sucursal
 * - mesero: Operaciones de servicio en su sucursal
 * - cocinero: Pantalla de cocina en su sucursal
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
    }

    // super_admin y admin siempre tienen acceso total al negocio
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
    }

    next();
  };
}

module.exports = authorizeRoles;
