const express = require('express');
const router = express.Router();
const printingController = require('../controllers/printing.controller');

// Rutas públicas de seguridad para QZ Tray (no requieren auth token para handshake de QZ)
router.get('/qz-certificate', printingController.getCertificate);
router.post('/qz-sign', express.text({ type: '*/*' }), printingController.signRequest);

module.exports = router;
