const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/metrics', dashboardController.getMetrics);

module.exports = router;
