const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// Endpoints para cambiar sucursal o negocio en tiempo real
router.post('/switch-branch', auth, authController.switchBranch);
router.post('/switch-business', auth, authController.switchBusiness);

module.exports = router;
