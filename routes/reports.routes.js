const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/shifts', rbac('admin', 'cajero', 'gerente'), reportsController.getShifts);
router.get('/shifts/:id', rbac('admin', 'cajero', 'gerente'), reportsController.getShiftById);
router.get('/shifts/:id/excel', rbac('admin', 'cajero', 'gerente'), reportsController.exportShiftExcel);
router.get('/shifts/:id/supplies-usage', rbac('admin', 'cajero', 'gerente'), reportsController.getShiftSuppliesUsage);

module.exports = router;

