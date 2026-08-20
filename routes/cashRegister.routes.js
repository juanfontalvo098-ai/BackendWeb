const express = require('express');
const router = express.Router();
const cashRegisterController = require('../controllers/cashRegister.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.post('/open', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.open);
router.get('/current', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.getCurrent);
router.get('/summary', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.getShiftSummary);
router.post('/movement', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.addMovement);
router.post('/movements', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.addMovement);
router.post('/close', rbac('super_admin', 'cajero', 'admin', 'gerente'), cashRegisterController.close);
router.get('/report/:id', rbac('super_admin', 'admin', 'gerente'), cashRegisterController.getReport);

module.exports = router;
