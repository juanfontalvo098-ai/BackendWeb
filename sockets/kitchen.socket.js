/**
 * Kitchen Socket — Multi-tenant
 * Rooms por sucursal y por negocio para comunicación en tiempo real
 */
const jwt = require('jsonwebtoken');

module.exports = function(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Autenticación requerida'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const { username, role, branchId, businessId } = socket.user;
    console.log(`Usuario conectado a Socket: ${username} (${role}) — Negocio: ${businessId || 'global'} — Sucursal: ${branchId || 'global'}`);

    // 1. Unir SIEMPRE al room del negocio
    if (businessId) {
      socket.join(`business:${businessId}`);
    }

    // 2. Unir a rooms de la sucursal activa
    if (branchId) {
      socket.join(`branch:${branchId}`);
      socket.join(`kitchen:${branchId}`);
      socket.join(`service:${branchId}`);
    }

    // 3. Roles específicos y administradores
    if (role === 'admin' || role === 'super_admin' || role === 'gerente') {
      const branchIds = socket.user.branchIds || [];
      branchIds.forEach(bid => {
        socket.join(`branch:${bid}`);
        socket.join(`kitchen:${bid}`);
        socket.join(`service:${bid}`);
      });
    }

    // Permitir cambio de sucursal en tiempo real
    socket.on('switch-branch', (data) => {
      const { newBranchId } = data;
      if (newBranchId && (role === 'admin' || role === 'super_admin' || role === 'gerente')) {
        if (branchId) {
          socket.leave(`branch:${branchId}`);
          socket.leave(`kitchen:${branchId}`);
          socket.leave(`service:${branchId}`);
        }
        socket.join(`branch:${newBranchId}`);
        socket.join(`kitchen:${newBranchId}`);
        socket.join(`service:${newBranchId}`);
        socket.user.branchId = newBranchId;
        console.log(`${username} cambió a sucursal: ${newBranchId}`);
      }
    });

    socket.on('kitchen:update-status', (data) => {
      const targetBranch = branchId || data.branchId;
      if (targetBranch) {
        io.to(`service:${targetBranch}`).emit('kitchen:update-status', data);
      }
      if (businessId) {
        io.to(`business:${businessId}`).emit('kitchen:update-status', data);
      }
    });

    socket.on('kitchen:ticket-ready', (data) => {
      const targetBranch = branchId || data.branchId;
      if (targetBranch) {
        io.to(`service:${targetBranch}`).emit('kitchen:ticket-ready', data);
      }
      if (businessId) {
        io.to(`business:${businessId}`).emit('kitchen:ticket-ready', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado de Socket: ${username}`);
    });
  });
};
