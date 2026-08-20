const express = require('express');
const router = express.Router();
const suppliesController = require('../controllers/supplies.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/movements', rbac('super_admin', 'admin', 'gerente', 'cajero', 'cocinero'), suppliesController.getMovements);
router.get('/', rbac('super_admin', 'admin', 'gerente', 'cajero', 'cocinero'), suppliesController.getAll);
router.post('/', rbac('super_admin', 'admin', 'gerente'), suppliesController.create);
router.get('/:id', rbac('super_admin', 'admin', 'gerente', 'cajero', 'cocinero'), suppliesController.getById);
router.put('/:id', rbac('super_admin', 'admin', 'gerente'), suppliesController.update);
router.delete('/:id', rbac('super_admin', 'admin', 'gerente'), suppliesController.remove);
router.post('/:id/adjust', rbac('super_admin', 'admin', 'gerente'), suppliesController.adjustStock);

module.exports = router;
