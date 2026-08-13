const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoices.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', invoicesController.getAll);
router.post('/', rbac('cajero', 'admin', 'gerente'), invoicesController.create);
router.get('/:id', invoicesController.getById);
router.get('/:id/print', rbac('cajero', 'admin', 'gerente'), invoicesController.getPrintFormat);
router.delete('/:id', rbac('admin', 'cajero', 'gerente'), invoicesController.remove);

module.exports = router;
