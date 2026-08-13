const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', productsController.getAll);
router.get('/:id', productsController.getById);

router.post('/', rbac('admin', 'gerente'), productsController.create);
router.put('/:id', rbac('admin', 'gerente'), productsController.update);
router.delete('/:id', rbac('admin', 'gerente'), productsController.remove);

module.exports = router;
