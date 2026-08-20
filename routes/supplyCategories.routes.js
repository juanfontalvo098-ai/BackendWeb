const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/supplyCategories.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');

router.use(auth, tenantMiddleware);

router.get('/', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero', 'cocinero'), ctrl.getAll);
router.post('/', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.create);
router.put('/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.update);
router.delete('/:id', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.remove);

module.exports = router;
