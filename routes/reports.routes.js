const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/shifts', rbac('admin', 'cajero'), reportsController.getShifts);
router.get('/shifts/:id', rbac('admin', 'cajero'), reportsController.getShiftById);
router.get('/shifts/:id/excel', rbac('admin', 'cajero'), reportsController.exportShiftExcel);

module.exports = router;
