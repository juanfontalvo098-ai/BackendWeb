const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/hr.controller');

router.use(auth, tenantMiddleware);

// Empleados
router.get('/employees', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getAllEmployees);
router.get('/employees/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getEmployeeById);
router.post('/employees', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createEmployee);
router.put('/employees/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.updateEmployee);
router.delete('/employees/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.removeEmployee);

// Asistencia
router.post('/attendance/clock-in', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero'), ctrl.clockIn);
router.post('/attendance/clock-out', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero'), ctrl.clockOut);
router.get('/attendance', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getAttendance);

// Turnos / Horarios
router.get('/schedule', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getSchedule);
router.post('/schedule', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createShift);
router.delete('/schedule/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.deleteShift);

// Nómina y Liquidación de Jornales / Días
router.get('/payroll', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getPayroll);
router.post('/payroll/liquidate', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.liquidateEmployee);
router.post('/payroll/generate', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.generatePayroll);
router.post('/payroll/approve', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.approvePayroll);
router.post('/payroll/pay', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.payPayroll);
router.post('/payroll/sync-accounting', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.syncAllPayrollToAccounting);

// Permisos y vacaciones
router.get('/leave', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getLeaveRequests);
router.post('/leave', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createLeaveRequest);
router.put('/leave/:id/status', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.updateLeaveStatus);

module.exports = router;
