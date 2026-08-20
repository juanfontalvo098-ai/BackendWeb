const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/suppliers.controller');

router.use(auth, tenantMiddleware);

router.get('/', authorizeRoles('admin', 'gerente'), ctrl.getAll);
router.get('/:id', authorizeRoles('admin', 'gerente'), ctrl.getById);
router.get('/:id/purchases', authorizeRoles('admin', 'gerente'), ctrl.getPurchaseHistory);
router.post('/', authorizeRoles('admin', 'gerente'), ctrl.create);
router.put('/:id', authorizeRoles('admin', 'gerente'), ctrl.update);
router.delete('/:id', authorizeRoles('admin'), ctrl.remove);
router.post('/:id/products', authorizeRoles('admin', 'gerente'), ctrl.addProduct);
router.delete('/:id/products/:productId', authorizeRoles('admin', 'gerente'), ctrl.removeProduct);

module.exports = router;
