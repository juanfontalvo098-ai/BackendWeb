const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const inventoryCtrl = require('../controllers/inventory.controller');
const poCtrl = require('../controllers/purchaseOrders.controller');
const recipesCtrl = require('../controllers/recipes.controller');
const scCtrl = require('../controllers/stockCounts.controller');

router.use(auth, tenantMiddleware);

// Inventario / Stock
router.get('/stock', authorizeRoles('admin', 'gerente'), inventoryCtrl.getStock);
router.get('/stock/export/excel', authorizeRoles('admin', 'gerente'), inventoryCtrl.exportStockExcel);
router.get('/alerts', authorizeRoles('admin', 'gerente', 'cajero'), inventoryCtrl.getLowStockAlerts);
router.get('/movements', authorizeRoles('admin', 'gerente'), inventoryCtrl.getMovements);
router.post('/adjust', authorizeRoles('admin', 'gerente'), inventoryCtrl.adjustStock);
router.post('/waste', authorizeRoles('admin', 'gerente'), inventoryCtrl.registerWaste);
router.post('/transfer', authorizeRoles('admin', 'gerente'), inventoryCtrl.transfer);

// Órdenes de compra
router.get('/purchase-orders', authorizeRoles('admin', 'gerente'), poCtrl.getAll);
router.get('/purchase-orders/:id', authorizeRoles('admin', 'gerente'), poCtrl.getById);
router.post('/purchase-orders', authorizeRoles('admin', 'gerente'), poCtrl.create);
router.put('/purchase-orders/:id', authorizeRoles('admin', 'gerente'), poCtrl.update);
router.post('/purchase-orders/:id/receive', authorizeRoles('admin', 'gerente'), poCtrl.receive);
router.post('/purchase-orders/:id/close', authorizeRoles('admin', 'gerente'), poCtrl.closeOrder);
router.post('/purchase-orders/:id/cancel', authorizeRoles('admin', 'gerente'), poCtrl.cancel);

// Recetas / BOM
router.get('/recipes', authorizeRoles('admin', 'gerente'), recipesCtrl.getAll);
router.get('/recipes/:id', authorizeRoles('admin', 'gerente'), recipesCtrl.getById);
router.post('/recipes', authorizeRoles('admin', 'gerente'), recipesCtrl.create);
router.put('/recipes/:id', authorizeRoles('admin', 'gerente'), recipesCtrl.update);
router.delete('/recipes/:id', authorizeRoles('admin', 'gerente'), recipesCtrl.remove);

// Conteo de inventario
router.get('/stock-counts', authorizeRoles('admin', 'gerente'), scCtrl.getAll);
router.get('/stock-counts/:id', authorizeRoles('admin', 'gerente'), scCtrl.getById);
router.post('/stock-counts', authorizeRoles('admin', 'gerente'), scCtrl.create);
router.put('/stock-counts/items/:itemId', authorizeRoles('admin', 'gerente'), scCtrl.updateItem);
router.post('/stock-counts/:id/complete', authorizeRoles('admin', 'gerente'), scCtrl.complete);
router.post('/stock-counts/:id/cancel', authorizeRoles('admin', 'gerente'), scCtrl.cancel);

module.exports = router;
