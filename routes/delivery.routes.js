const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/delivery.controller');

router.use(auth, tenantMiddleware);

// Zonas de delivery
router.get('/zones', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.getZones);
router.post('/zones', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createZone);
router.put('/zones/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.updateZone);

// Asignaciones
router.get('/assignments', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.getAssignments);
router.post('/assign', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.assignDriver);
router.put('/assignments/:id/status', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.updateAssignmentStatus);

// Órdenes de delivery y pendientes
router.get('/pending', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.getPendingOrders);
router.post('/orders', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.createDeliveryOrder);

// Domiciliarios
router.get('/drivers', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'mesero'), ctrl.getDrivers);

module.exports = router;
