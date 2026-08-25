const router = require('express').Router();
const auth = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const authorizeRoles = require('../middleware/rbac');
const ctrl = require('../controllers/accounting.controller');

router.use(auth, tenantMiddleware);

// Dashboard Financiero General
router.get('/dashboard', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getFinancialDashboard);

// Plan de cuentas
router.get('/accounts', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getChartOfAccounts);
router.post('/accounts', authorizeRoles('super_admin', 'admin'), ctrl.createAccount);
router.put('/accounts/:id', authorizeRoles('super_admin', 'admin'), ctrl.updateAccount);
router.post('/accounts/initialize', authorizeRoles('super_admin', 'admin'), ctrl.initializeDefaultAccounts);

// Libro diario
router.get('/journal', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getJournalEntries);
router.post('/journal', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createJournalEntry);
router.post('/journal/:id/approve', authorizeRoles('super_admin', 'admin'), ctrl.approveJournalEntry);
router.post('/sync-movements', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.syncCashMovementsToJournal);

// Libro mayor
router.get('/ledger', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getLedger);

// Estados financieros
router.get('/balance-sheet', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getBalanceSheet);
router.get('/income-statement', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getIncomeStatement);

// Cuentas por cobrar
router.get('/receivable', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getAccountsReceivable);
router.post('/receivable', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createReceivable);
router.post('/receivable/:id/payment', authorizeRoles('super_admin', 'admin', 'gerente', 'cajero'), ctrl.recordReceivablePayment);
router.put('/receivable/:id/adjust', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.adjustReceivableBalance);

// Cuentas por pagar
router.get('/payable', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.getAccountsPayable);
router.post('/payable', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.createPayable);
// Exportación
router.get('/export/excel', authorizeRoles('super_admin', 'admin', 'gerente'), ctrl.exportAccountingExcel);

module.exports = router;

