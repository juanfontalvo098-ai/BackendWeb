const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);
router.use(rbac('admin'));

router.get('/', usersController.getAll);
router.post('/', usersController.create);
router.put('/:id', usersController.update);
router.delete('/:id', usersController.remove);
router.delete('/:id/permanent', usersController.deleteUser);

module.exports = router;
