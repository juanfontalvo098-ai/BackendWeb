const express = require('express');
const router = express.Router();
const tablesController = require('../controllers/tables.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', tablesController.getAll);
router.get('/:id', tablesController.getById);
router.post('/', rbac('admin', 'gerente'), tablesController.create);
router.put('/:id', rbac('admin', 'gerente'), tablesController.updateTable);
router.delete('/:id', rbac('admin', 'gerente'), tablesController.deleteTable);
router.put('/:id/status', rbac('mesero', 'cajero', 'admin', 'gerente'), tablesController.updateStatus);

module.exports = router;
