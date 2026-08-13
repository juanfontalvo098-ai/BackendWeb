const express = require('express');
const router = express.Router();
const businessesController = require('../controllers/businesses.controller');
const branchesController = require('../controllers/branches.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', businessesController.getAll);
router.get('/:id', businessesController.getById);
router.post('/', rbac('super_admin'), businessesController.create);
router.put('/:id', rbac('super_admin', 'admin'), businessesController.update);
router.delete('/:id', rbac('super_admin'), businessesController.remove);
router.delete('/:id/permanent', rbac('super_admin'), businessesController.deletePermanent);

// Rutas anidadas de sucursales por negocio
router.get('/:businessId/branches', branchesController.getByBusiness);
router.post('/:businessId/branches', rbac('super_admin', 'admin'), branchesController.create);

module.exports = router;
