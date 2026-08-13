const express = require('express');
const router = express.Router();
const branchesController = require('../controllers/branches.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.put('/:id', rbac('super_admin', 'admin'), branchesController.update);
router.delete('/:id', rbac('super_admin', 'admin'), branchesController.remove);
router.delete('/:id/permanent', rbac('super_admin'), branchesController.deletePermanent);

module.exports = router;
