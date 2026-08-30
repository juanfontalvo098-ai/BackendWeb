const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', ordersController.getAll);
router.get('/kitchen-queue', ordersController.getKitchenQueue);
router.get('/:id', ordersController.getById);

router.post('/', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.create);
router.put('/:id', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.updateOrder);
router.post('/:id/items', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.addItems);
router.delete('/:id/items/:itemId', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.removeItem);
router.put('/:id/items/:itemId/quantity', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.updateItemQuantity);
router.put('/:id/items/:itemId/price', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.updateItemPrice);
router.put('/:id/items/:itemId/notes', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.updateItemNotes);

router.post('/:id/send-kitchen', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.sendToKitchen);
router.post('/:id/send-to-kitchen', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.sendToKitchen);
router.post('/:id/cancel', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.cancelOrder);
router.delete('/:id/cleanup', rbac('mesero', 'cajero', 'admin', 'gerente'), ordersController.cleanupEmptyOrder);
router.put('/:id/status', ordersController.updateStatus);
router.put('/:id/items/:itemId/status', rbac('cocinero', 'admin', 'gerente'), ordersController.updateItemStatus);

module.exports = router;
