const express = require('express');
const router = express.Router();
const modifiersController = require('../controllers/modifiers.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

// Rutas de modificadores por producto
router.get('/products/:productId', modifiersController.getByProductId);
router.post('/products/:productId', rbac('admin', 'gerente'), modifiersController.saveProductModifiers);
router.put('/options/:optionId/availability', rbac('admin', 'gerente', 'cajero', 'mesero'), modifiersController.toggleOptionAvailability);

// Rutas de plantillas reutilizables
router.get('/templates', modifiersController.getTemplates);
router.post('/templates', rbac('admin', 'gerente'), modifiersController.saveAsTemplate);
router.delete('/templates/:templateId', rbac('admin', 'gerente'), modifiersController.deleteTemplate);

module.exports = router;
