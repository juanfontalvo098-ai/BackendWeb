/**
 * Users Controller — Multi-tenant
 * CRUD de usuarios filtrado por business_id
 */
const knex = require('../database/knex');
const bcrypt = require('bcryptjs');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('users')
      .select('id', 'username', 'full_name', 'role', 'is_active', 'permissions', 'branch_id', 'created_at')
      .where('business_id', businessId);

    // Si no es admin global, solo ve usuarios de su sucursal
    if (!isGlobalScope && branchId) {
      query.andWhere(function() {
        this.where('branch_id', branchId).orWhereNull('branch_id');
      });
    }

    const users = await query.orderBy('created_at', 'desc');

    // Para cada usuario, obtener nombre de sucursal
    const branches = await knex('branches').where('business_id', businessId);
    const branchMap = {};
    branches.forEach(b => branchMap[b.id] = b.name);

    users.forEach(u => {
      u.branch_name = u.branch_id ? (branchMap[u.branch_id] || 'Sin asignar') : 'Todas las sucursales';
      // JSONB ya viene como objeto en PostgreSQL, no necesita JSON.parse
      if (typeof u.permissions === 'string') {
        try { u.permissions = JSON.parse(u.permissions); } catch (e) { u.permissions = null; }
      }
    });

    res.json(users);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener lista de usuarios' });
  }
};

exports.create = async (req, res) => {
  const { username, password, full_name, role, permissions, branch_id } = req.body;
  const { businessId } = req.tenant;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // Protección: Solo un super_admin puede crear otro super_admin
  if (role === 'super_admin' && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo un Super Administrador puede crear usuarios con rol de Super Admin' });
  }

  try {
    // Verificar que el username no exista dentro del mismo negocio
    const existing = await knex('users')
      .where({ business_id: businessId, username })
      .first();

    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya se encuentra registrado' });
    }

    // Si se especifica branch_id, validar que pertenece al negocio
    let finalBranchId = null;
    if (branch_id && typeof branch_id === 'string' && branch_id.trim() !== '' && branch_id !== 'all') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch_id.trim());
      if (isUuid) {
        const branch = await knex('branches')
          .where({ id: branch_id.trim(), business_id: businessId })
          .first();
        if (branch) finalBranchId = branch.id;
      }
    }

    // Filtrar permiso /negocios si quien crea no es super_admin
    let safePermissions = Array.isArray(permissions) ? permissions : [];
    if (req.user?.role !== 'super_admin') {
      safePermissions = safePermissions.filter(p => p !== '/negocios');
    }

    const [newUser] = await knex('users').insert({
      business_id: businessId,
      username,
      password_hash: bcrypt.hashSync(password, 10),
      full_name,
      role: role || 'mesero',
      permissions: safePermissions.length > 0 ? JSON.stringify(safePermissions) : null,
      branch_id: finalBranchId,
      is_active: true
    }).returning(['id', 'username', 'full_name', 'role', 'permissions', 'branch_id']);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: newUser
    });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { full_name, role, is_active, password, permissions, branch_id } = req.body;
  const { businessId } = req.tenant;

  try {
    // Verificar que el usuario pertenece al mismo negocio
    const user = await knex('users').where({ id, business_id: businessId }).first();
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Protección: Un admin normal no puede modificar una cuenta de Super Admin
    if (user.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'No tienes permisos para modificar una cuenta de Super Administrador' });
    }

    // Protección: Un admin normal no puede ascender una cuenta a Super Admin
    if (role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Solo un Super Administrador puede asignar el rol de Super Admin' });
    }

    let finalBranchId = null;
    if (branch_id && typeof branch_id === 'string' && branch_id.trim() !== '' && branch_id !== 'all') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch_id.trim());
      if (isUuid) {
        const branch = await knex('branches')
          .where({ id: branch_id.trim(), business_id: businessId })
          .first();
        if (branch) finalBranchId = branch.id;
      }
    }

    // Filtrar permiso /negocios si quien edita no es super_admin
    let safePermissions = Array.isArray(permissions) ? permissions : [];
    if (req.user?.role !== 'super_admin') {
      safePermissions = safePermissions.filter(p => p !== '/negocios');
    }

    const updateData = {
      full_name,
      role: (req.user?.role !== 'super_admin' && user.role === 'admin' && role === 'super_admin') ? 'admin' : role,
      is_active,
      permissions: safePermissions.length > 0 ? JSON.stringify(safePermissions) : null,
      branch_id: finalBranchId,
      updated_at: knex.fn.now()
    };

    if (password && password.trim() !== '') {
      updateData.password_hash = bcrypt.hashSync(password, 10);
    }

    await knex('users')
      .where({ id, business_id: businessId })
      .update(updateData);

    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error al actualizar información del usuario' });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    const user = await knex('users').where({ id, business_id: businessId }).first();
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'No tienes permisos para desactivar una cuenta de Super Administrador' });
    }

    await knex('users')
      .where({ id, business_id: businessId })
      .update({ is_active: false, updated_at: knex.fn.now() });
    res.json({ message: 'Usuario desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar usuario:', err);
    res.status(500).json({ error: 'Error al desactivar el usuario' });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  const { businessId } = req.tenant;

  try {
    const user = await knex('users').where({ id, business_id: businessId }).first();
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'No tienes permisos para eliminar una cuenta de Super Administrador' });
    }

    const deleted = await knex('users')
      .where({ id, business_id: businessId })
      .del();
    if (!deleted) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado definitivamente de la base de datos' });
  } catch (err) {
    res.status(400).json({ error: 'No se puede eliminar un usuario con transacciones asociadas. Te recomendamos desactivarlo.' });
  }
};
