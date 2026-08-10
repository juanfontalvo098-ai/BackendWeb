const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', ordersController.getAll);
router.get('/:id', ordersController.getById);

router.post('/', rbac('mesero', 'cajero', 'admin'), ordersController.create);
router.post('/:id/items', rbac('mesero', 'cajero', 'admin'), ordersController.addItems);
router.delete('/:id/items/:itemId', rbac('mesero', 'cajero', 'admin'), ordersController.removeItem);
router.put('/:id/items/:itemId/quantity', rbac('mesero', 'cajero', 'admin'), ordersController.updateItemQuantity);

router.post('/:id/send-kitchen', rbac('mesero', 'cajero', 'admin'), ordersController.sendToKitchen);
router.post('/:id/send-to-kitchen', rbac('mesero', 'cajero', 'admin'), ordersController.sendToKitchen);
router.post('/:id/cancel', rbac('mesero', 'cajero', 'admin'), ordersController.cancelOrder);
router.put('/:id/status', ordersController.updateStatus);
router.put('/:id/items/:itemId/status', rbac('cocinero', 'admin'), ordersController.updateItemStatus);

module.exports = router;
