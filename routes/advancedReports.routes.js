const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/advancedReports.controller');

router.use(auth, tenantMiddleware);

router.get('/inventory', authorizeRoles('admin', 'gerente'), ctrl.getInventoryReport);
router.get('/profit-margins', authorizeRoles('admin', 'gerente'), ctrl.getProfitMarginReport);
router.get('/period-comparison', authorizeRoles('admin', 'gerente'), ctrl.getPeriodComparison);
router.get('/customers', authorizeRoles('admin', 'gerente'), ctrl.getCustomerReport);
router.get('/branches', authorizeRoles('admin'), ctrl.getBranchComparison);
router.get('/discounts', authorizeRoles('admin', 'gerente'), ctrl.getDiscountsReport);

module.exports = router;
