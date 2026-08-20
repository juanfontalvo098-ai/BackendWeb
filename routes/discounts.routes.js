const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/discounts.controller');

router.use(auth, tenantMiddleware);

// Descuentos
router.get('/', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.getAllDiscounts);
router.get('/applicable', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.getApplicableDiscounts);
router.post('/', authorizeRoles('admin', 'gerente'), ctrl.createDiscount);
router.put('/:id', authorizeRoles('admin', 'gerente'), ctrl.updateDiscount);
router.delete('/:id', authorizeRoles('admin', 'gerente'), ctrl.removeDiscount);

// Cupones
router.get('/coupons', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.getAllCoupons);
router.post('/coupons', authorizeRoles('admin', 'gerente'), ctrl.createCoupon);
router.post('/coupons/validate', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.validateCoupon);
router.post('/coupons/redeem', authorizeRoles('admin', 'gerente', 'cajero', 'mesero'), ctrl.redeemCoupon);

// Listas de precios
router.get('/price-lists', authorizeRoles('admin', 'gerente'), ctrl.getAllPriceLists);
router.post('/price-lists', authorizeRoles('admin', 'gerente'), ctrl.createPriceList);
router.get('/price-lists/:id/items', authorizeRoles('admin', 'gerente'), ctrl.getPriceListItems);

module.exports = router;
