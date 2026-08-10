const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoices.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', invoicesController.getAll);
router.post('/', rbac('cajero', 'admin'), invoicesController.create);
router.get('/:id', invoicesController.getById);
router.get('/:id/print', rbac('cajero', 'admin'), invoicesController.getPrintFormat);
router.delete('/:id', rbac('admin', 'cajero'), invoicesController.remove);

module.exports = router;
