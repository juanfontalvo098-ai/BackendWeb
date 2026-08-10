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
    console.log(`Usuario conectado: ${socket.user.username} (${socket.user.role})`);

    // Unir a salas según el rol
    if (socket.user.role === 'cocinero') {
      socket.join('kitchen');
    } else if (socket.user.role === 'mesero') {
      socket.join('service');
    } else if (socket.user.role === 'admin') {
      socket.join('admin');
      socket.join('kitchen');
      socket.join('service');
    }

    socket.on('kitchen:update-status', (data) => {
      // data: { ticketId, status }
      io.to('service').to('admin').emit('kitchen:update-status', data);
    });

    socket.on('kitchen:ticket-ready', (data) => {
      // data: { ticketId }
      io.to('service').to('admin').emit('kitchen:ticket-ready', data);
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${socket.user.username}`);
    });
  });
};
