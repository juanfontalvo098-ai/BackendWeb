const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.get('/', settingsController.getSettings);
router.put('/', auth, rbac('admin'), settingsController.updateSettings);

module.exports = router;
