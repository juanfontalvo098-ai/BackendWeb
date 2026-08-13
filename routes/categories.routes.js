const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(tenantMiddleware);

router.get('/', categoriesController.getAll);
router.post('/', rbac('admin', 'gerente'), categoriesController.create);
router.put('/:id', rbac('admin', 'gerente'), categoriesController.update);
router.delete('/:id', rbac('admin', 'gerente'), categoriesController.remove);

module.exports = router;
