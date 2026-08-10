const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', productsController.getAll);
router.get('/:id', productsController.getById);

router.post('/', rbac('admin'), productsController.create);
router.put('/:id', rbac('admin'), productsController.update);
router.delete('/:id', rbac('admin'), productsController.remove);

module.exports = router;
