/**
 * Auth Controller — Multi-tenant & Super Admin Platform Support
 */
const knex = require('../database/knex');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const user = await knex('users')
      .where({ username, is_active: true })
      .first();

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let business = null;
    let businesses = [];
    let branches = [];
    let activeBranchId = user.branch_id;

    if (user.role === 'super_admin') {
      // Super Admin: Acceso a TODOS los negocios y sucursales de la plataforma
      businesses = await knex('businesses').where({ is_active: true }).orderBy('name');
      business = businesses.find(b => b.id === user.business_id) || businesses[0] || null;
      
      if (business) {
        branches = await knex('branches').where({ business_id: business.id, is_active: true }).orderBy('name');
        activeBranchId = branches.length > 0 ? branches[0].id : null;
      }
    } else {
      // Usuario normal / Admin de negocio
      business = await knex('businesses')
        .where({ id: user.business_id, is_active: true })
        .first();

      if (!business) {
        return res.status(403).json({ error: 'El negocio asociado a tu cuenta está inactivo' });
      }

      businesses = [business];

      if (user.branch_id) {
        const branch = await knex('branches')
          .where({ id: user.branch_id, is_active: true })
          .first();
        if (branch) {
          branches = [branch];
          activeBranchId = branch.id;
        }
      } else {
        branches = await knex('branches')
          .where({ business_id: user.business_id, is_active: true })
          .orderBy('name');
        activeBranchId = branches.length > 0 ? branches[0].id : null;
      }
    }

    const branchIds = branches.map(b => b.id);

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      businessId: business ? business.id : user.business_id,
      branchId: activeBranchId,
      branchIds
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    const refreshToken = jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d' }
    );

    let permissions = null;
    if (user.permissions) {
      try {
        permissions = typeof user.permissions === 'string'
          ? JSON.parse(user.permissions)
          : user.permissions;
      } catch (e) {
        permissions = null;
      }
    }

    const userData = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      permissions,
      businessId: business ? business.id : user.business_id,
      businessName: business ? business.name : 'Plataforma',
      businessSlug: business ? business.slug : 'super-admin',
      branchId: activeBranchId,
      branchIds,
      branches: branches.map(b => ({ id: b.id, name: b.name, code: b.code })),
      businesses: businesses.map(b => ({ id: b.id, name: b.name, slug: b.slug, plan: b.plan }))
    };

    res.json({ user: userData, accessToken, refreshToken });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
};

exports.refreshToken = (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'El refresh token es requerido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const payload = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      businessId: decoded.businessId,
      branchId: decoded.branchId,
      branchIds: decoded.branchIds
    };
    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Sesión cerrada correctamente' });
};

exports.switchBranch = async (req, res) => {
  const { branchId } = req.body;
  if (!branchId) return res.status(400).json({ error: 'branchId es requerido' });

  try {
    let query = knex('branches').where({ id: branchId, is_active: true });
    if (req.user.role !== 'super_admin') {
      query.andWhere('business_id', req.user.businessId);
    }

    const branch = await query.first();

    if (!branch) {
      return res.status(404).json({ error: 'Sucursal no encontrada o no tienes acceso' });
    }

    const payload = {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      businessId: branch.business_id,
      branchId: branch.id,
      branchIds: req.user.branchIds
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    res.json({
      accessToken,
      branch: { id: branch.id, name: branch.name, code: branch.code }
    });
  } catch (err) {
    console.error('Error al cambiar sucursal:', err);
    res.status(500).json({ error: 'Error al cambiar de sucursal' });
  }
};

/**
 * Switch Business — Exclusivo para Super Admin
 * Permite al dueño de la plataforma saltar al contexto de cualquier cliente
 */
exports.switchBusiness = async (req, res) => {
  const { businessId } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId es requerido' });

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo el Super Administrador puede cambiar entre negocios' });
  }

  try {
    const business = await knex('businesses').where({ id: businessId, is_active: true }).first();
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado o inactivo' });

    const branches = await knex('branches').where({ business_id: business.id, is_active: true }).orderBy('name');
    const activeBranchId = branches.length > 0 ? branches[0].id : null;
    const branchIds = branches.map(b => b.id);

    const payload = {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      businessId: business.id,
      branchId: activeBranchId,
      branchIds
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    res.json({
      accessToken,
      business: { id: business.id, name: business.name, slug: business.slug },
      branchId: activeBranchId,
      branches: branches.map(b => ({ id: b.id, name: b.name, code: b.code }))
    });
  } catch (err) {
    console.error('Error al cambiar de negocio:', err);
    res.status(500).json({ error: 'Error al cambiar de negocio' });
  }
};
