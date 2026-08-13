/**
 * Middleware de Tenant — Inyecta el contexto multi-tenant en cada request
 * 
 * Debe ejecutarse DESPUÉS del middleware auth (necesita req.user).
 * Inyecta req.tenant = { businessId, branchId } que todos los controladores usan.
 * 
 * Flujo:
 * 1. Lee business_id y branch_id del JWT (req.user)
 * 2. Opcionalmente permite override de branch_id vía header X-Branch-Id
 *    (para admin/gerente que cambian de sucursal en el frontend)
 * 3. Valida que el usuario tiene acceso a la sucursal solicitada
 * 4. Inyecta req.tenant en el request
 */
const knex = require('../database/knex');

function tenantMiddleware(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticación requerida antes de resolver tenant' });
    }

    const { businessId, branchId: tokenBranchId, branchIds, role } = req.user;

    if (!businessId) {
      return res.status(400).json({ error: 'El usuario no tiene un negocio asignado' });
    }

    // Determinar el branchId efectivo
    // 1. Header X-Branch-Id (override para admin/gerente)
    // 2. branchId del JWT token
    const headerBranchId = req.headers['x-branch-id'];
    let effectiveBranchId = headerBranchId || tokenBranchId;

    // Validar acceso a la sucursal
    if (effectiveBranchId && branchIds && branchIds.length > 0) {
      // Si el user tiene lista de sucursales permitidas, validar
      if (!branchIds.includes(effectiveBranchId) && role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'No tienes acceso a esta sucursal' });
      }
    }

    // admin y super_admin sin branch_id pueden operar en scope global (todo el negocio)
    // Para estos roles, branchId puede ser null (ver datos de todas las sucursales)
    if (!effectiveBranchId && !['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Se requiere una sucursal activa para tu rol' });
    }

    // Inyectar contexto de tenant en el request
    req.tenant = {
      businessId,
      branchId: effectiveBranchId || null,
      // Helper: ¿Este usuario tiene scope global (todas las sucursales)?
      isGlobalScope: !effectiveBranchId && ['admin', 'super_admin'].includes(role)
    };

    next();
  } catch (err) {
    console.error('Error en tenant middleware:', err);
    return res.status(500).json({ error: 'Error al resolver contexto del negocio' });
  }
}

/**
 * Helper para agregar filtros de tenant a queries Knex
 * Uso: addTenantFilter(knex('products'), req.tenant, { allowGlobalBranch: true })
 * 
 * @param {Knex.QueryBuilder} query - Query builder de Knex
 * @param {Object} tenant - req.tenant
 * @param {Object} options - Opciones de filtrado
 * @param {boolean} options.allowGlobalBranch - Si true, incluye registros con branch_id NULL
 * @param {string} options.tableAlias - Alias de tabla (para JOINs)
 */
function addTenantFilter(query, tenant, options = {}) {
  const { allowGlobalBranch = false, tableAlias = '' } = options;
  const prefix = tableAlias ? `${tableAlias}.` : '';

  // Siempre filtrar por business_id
  query.where(`${prefix}business_id`, tenant.businessId);

  // Filtrar por branch_id según el scope
  if (tenant.branchId && !tenant.isGlobalScope) {
    if (allowGlobalBranch) {
      // Incluir registros globales (branch_id = NULL) + los de la sucursal
      query.andWhere(function() {
        this.whereNull(`${prefix}branch_id`).orWhere(`${prefix}branch_id`, tenant.branchId);
      });
    } else {
      query.andWhere(`${prefix}branch_id`, tenant.branchId);
    }
  }
  // Si isGlobalScope (admin), no filtra por branch_id → ve todo el negocio

  return query;
}

module.exports = { tenantMiddleware, addTenantFilter };
