const express = require('express');
const router = express.Router();
const tablesController = require('../controllers/tables.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', tablesController.getAll);
router.post('/', rbac('admin'), tablesController.create);
router.put('/:id', rbac('admin'), tablesController.updateTable);
router.delete('/:id', rbac('admin'), tablesController.deleteTable);
router.put('/:id/status', rbac('mesero', 'cajero', 'admin'), tablesController.updateStatus);

module.exports = router;
