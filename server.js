require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { runMigrations } = require('./database/migrations');
const errorHandler = require('./middleware/errorHandler');

// Rutas
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const categoriesRoutes = require('./routes/categories.routes');
const productsRoutes = require('./routes/products.routes');
const tablesRoutes = require('./routes/tables.routes');
const ordersRoutes = require('./routes/orders.routes');
const cashRegisterRoutes = require('./routes/cashRegister.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const settingsRoutes = require('./routes/settings.routes');
const uploadRoutes = require('./routes/upload.routes');
const reportsRoutes = require('./routes/reports.routes');

const app = express();
const server = http.createServer(app);

// Configurar Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.locals.io = io;
require('./sockets/kitchen.socket')(io);

// Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Servir estáticos para imágenes subidas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { error: 'Demasiadas peticiones. Intente más tarde.' }
});
app.use(limiter);

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/cash', cashRegisterRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportsRoutes);

// Manejador de errores
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await runMigrations();
    console.log('Base de datos inicializada correctamente.');

    server.listen(PORT, () => {
      console.log(`✅ Servidor POS iniciado y escuchando en el puerto ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err);
    process.exit(1);
  }
})();
