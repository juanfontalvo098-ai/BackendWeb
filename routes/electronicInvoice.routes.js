const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/electronicInvoice.controller');

router.use(auth, tenantMiddleware);

// Secuencias de numeración
router.get('/sequences', authorizeRoles('admin'), ctrl.getSequences);
router.post('/sequences', authorizeRoles('admin'), ctrl.createSequence);
router.put('/sequences/:id', authorizeRoles('admin'), ctrl.updateSequence);

// Notas crédito
router.get('/credit-notes', authorizeRoles('admin', 'gerente'), ctrl.getCreditNotes);
router.post('/credit-notes', authorizeRoles('admin', 'gerente'), ctrl.createCreditNote);

// Notas débito
router.get('/debit-notes', authorizeRoles('admin', 'gerente'), ctrl.getDebitNotes);
router.post('/debit-notes', authorizeRoles('admin', 'gerente'), ctrl.createDebitNote);

module.exports = router;
