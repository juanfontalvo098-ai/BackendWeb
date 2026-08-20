const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/customers.controller');

router.use(auth, tenantMiddleware);

router.get('/', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.getAll);
router.get('/:id', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.getById);
router.get('/:id/purchases', authorizeRoles('admin', 'gerente', 'cajero'), ctrl.getPurchaseHistory);
router.post('/', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.create);
router.put('/:id', authorizeRoles('admin', 'gerente', 'cajero'), ctrl.update);
router.delete('/:id', authorizeRoles('admin', 'gerente'), ctrl.remove);
router.post('/:id/credit', authorizeRoles('admin', 'gerente'), ctrl.adjustCredit);
router.post('/:id/loyalty', authorizeRoles('admin', 'gerente'), ctrl.adjustLoyaltyPoints);

module.exports = router;
