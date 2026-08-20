require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const knex = require('./database/knex');
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

const businessesRoutes = require('./routes/businesses.routes');
const branchesRoutes = require('./routes/branches.routes');

// ERP Routes
const customersRoutes = require('./routes/customers.routes');
const suppliersRoutes = require('./routes/suppliers.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const discountsRoutes = require('./routes/discounts.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const accountingRoutes = require('./routes/accounting.routes');
const hrRoutes = require('./routes/hr.routes');
const suppliesRoutes = require('./routes/supplies.routes');
const supplyCategoriesRoutes = require('./routes/supplyCategories.routes');
const electronicInvoiceRoutes = require('./routes/electronicInvoice.routes');
const advancedReportsRoutes = require('./routes/advancedReports.routes');

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
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    system: 'GastrosPOS ERP'
  });
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessesRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/cash', cashRegisterRoutes);
app.use('/api/cash-register', cashRegisterRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportsRoutes);

// Montar rutas ERP
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/supplies', suppliesRoutes);
app.use('/api/supply-categories', supplyCategoriesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/electronic-invoice', electronicInvoiceRoutes);
app.use('/api/advanced-reports', advancedReportsRoutes);

// Manejador de errores para la API
app.use('/api', errorHandler);

// --- SPA / API Status Handling ---
const fs = require('fs');
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const indexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(indexPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    res.sendFile(indexPath);
  });
} else {
  // Cuando el backend está desplegado por separado en Render (API Only)
  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      service: 'KAMIA by JF - POS & ERP API',
      health: '/api/health',
      timestamp: new Date().toISOString()
    });
  });

  app.get('*', (req, res) => {
    res.status(404).json({
      error: 'Ruta no encontrada',
      message: 'Servidor API Backend activo. Para utilizar la interfaz gráfica, ingresa a la URL del frontend.'
    });
  });
}

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    // Ejecutar migraciones de Knex automáticamente
    console.log('Ejecutando migraciones de base de datos...');
    await knex.migrate.latest();
    console.log('✅ Migraciones completadas.');

    // Verificar si hay datos, si no, ejecutar seeds
    const businessCount = await knex('businesses').count('id as count').first();
    if (parseInt(businessCount.count) === 0) {
      console.log('Base de datos vacía. Ejecutando seeds...');
      await knex.seed.run();
      console.log('✅ Seeds completados.');
    }

    server.listen(PORT, () => {
      console.log(`✅ Servidor POS Multi-tenant iniciado en el puerto ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   SPA: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err);
    process.exit(1);
  }
})();
