/**
 * Kitchen Socket — Multi-tenant
 * Rooms por sucursal para aislar la comunicación en tiempo real
 * Formato de rooms: branch:{branchId}
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
    console.log(`Usuario conectado: ${username} (${role}) — Sucursal: ${branchId || 'global'}`);

    // Unir a rooms de la sucursal activa
    if (branchId) {
      socket.join(`branch:${branchId}`);
    }

    // Roles específicos se unen a rooms adicionales dentro de su sucursal
    if (role === 'cocinero' && branchId) {
      socket.join(`kitchen:${branchId}`);
    } else if (role === 'mesero' && branchId) {
      socket.join(`service:${branchId}`);
    } else if (role === 'admin' || role === 'super_admin') {
      // Admin se une a todas las rooms de sus sucursales
      const branchIds = socket.user.branchIds || [];
      branchIds.forEach(bid => {
        socket.join(`branch:${bid}`);
        socket.join(`kitchen:${bid}`);
        socket.join(`service:${bid}`);
      });
      // También la sucursal activa
      if (branchId) {
        socket.join(`kitchen:${branchId}`);
        socket.join(`service:${branchId}`);
      }
    } else if (role === 'cajero' && branchId) {
      socket.join(`service:${branchId}`);
    }

    // Permitir cambio de sucursal en tiempo real (para admin)
    socket.on('switch-branch', (data) => {
      const { newBranchId } = data;
      if (newBranchId && (role === 'admin' || role === 'super_admin' || role === 'gerente')) {
        // Dejar rooms de la sucursal anterior
        if (branchId) {
          socket.leave(`branch:${branchId}`);
          socket.leave(`kitchen:${branchId}`);
          socket.leave(`service:${branchId}`);
        }
        // Unir a las nuevas rooms
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
    });

    socket.on('kitchen:ticket-ready', (data) => {
      const targetBranch = branchId || data.branchId;
      if (targetBranch) {
        io.to(`service:${targetBranch}`).emit('kitchen:ticket-ready', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${username}`);
    });
  });
};
