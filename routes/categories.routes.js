const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', categoriesController.getAll);

router.post('/', rbac('admin'), categoriesController.create);
router.put('/:id', rbac('admin'), categoriesController.update);
router.delete('/:id', rbac('admin'), categoriesController.remove);

module.exports = router;
