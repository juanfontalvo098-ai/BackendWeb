const express = require('express');
const router = express.Router();
const cashRegisterController = require('../controllers/cashRegister.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.post('/open', rbac('cajero', 'admin', 'gerente'), cashRegisterController.open);
router.get('/current', rbac('cajero', 'admin', 'gerente'), cashRegisterController.getCurrent);
router.get('/summary', rbac('cajero', 'admin', 'gerente'), cashRegisterController.getShiftSummary);
router.post('/movement', rbac('cajero', 'admin', 'gerente'), cashRegisterController.addMovement);
router.post('/movements', rbac('cajero', 'admin', 'gerente'), cashRegisterController.addMovement);
router.post('/close', rbac('cajero', 'admin', 'gerente'), cashRegisterController.close);
router.get('/report/:id', rbac('admin', 'gerente'), cashRegisterController.getReport);

module.exports = router;
