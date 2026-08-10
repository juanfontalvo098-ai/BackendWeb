const express = require('express');
const router = express.Router();
const cashRegisterController = require('../controllers/cashRegister.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/open', rbac('cajero', 'admin'), cashRegisterController.open);
router.get('/current', rbac('cajero', 'admin'), cashRegisterController.getCurrent);
router.get('/summary', rbac('cajero', 'admin'), cashRegisterController.getShiftSummary);
router.post('/movement', rbac('cajero', 'admin'), cashRegisterController.addMovement);
router.post('/movements', rbac('cajero', 'admin'), cashRegisterController.addMovement);
router.post('/close', rbac('cajero', 'admin'), cashRegisterController.close);
router.get('/report/:id', rbac('admin'), cashRegisterController.getReport);

module.exports = router;
