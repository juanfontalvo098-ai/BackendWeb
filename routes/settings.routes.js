const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', settingsController.getSettings);
router.put('/', rbac('admin', 'gerente'), settingsController.updateSettings);

module.exports = router;
