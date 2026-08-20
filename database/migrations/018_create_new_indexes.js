/**
 * Migration 018: Crear índices de performance para nuevas tablas ERP
 */
exports.up = function(knex) {
  return knex.schema
    .alterTable('inventory', (table) => {
      table.index(['product_id'], 'idx_inventory_product');
    })
    .alterTable('inventory_movements', (table) => {
      table.index(['created_at'], 'idx_inv_movements_date');
    })
    .alterTable('purchase_orders', (table) => {
      table.index(['status'], 'idx_purchase_orders_status');
    })
    .alterTable('customers', (table) => {
      table.index(['name'], 'idx_customers_name');
      table.index(['customer_type'], 'idx_customers_type');
    })
    .alterTable('suppliers', (table) => {
      table.index(['name'], 'idx_suppliers_name');
    })
    .alterTable('employees', (table) => {
      table.index(['branch_id'], 'idx_employees_branch');
    })
    .alterTable('attendance', (table) => {
      table.index(['business_id', 'branch_id'], 'idx_attendance_tenant');
    })
    .alterTable('payroll', (table) => {
      table.index(['status'], 'idx_payroll_status');
      table.index(['period_start', 'period_end'], 'idx_payroll_period');
    })
    .alterTable('journal_entries', (table) => {
      table.index(['reference_type', 'reference_id'], 'idx_journal_entries_ref');
    })
    .alterTable('orders', (table) => {
      table.index(['order_type'], 'idx_orders_type');
      table.index(['customer_id'], 'idx_orders_customer');
    })
    .alterTable('invoices', (table) => {
      table.index(['customer_id'], 'idx_invoices_customer');
    });
};

exports.down = function(knex) {
  return knex.schema
    .alterTable('inventory', (t) => { t.dropIndex([], 'idx_inventory_product'); })
    .alterTable('inventory_movements', (t) => { t.dropIndex([], 'idx_inv_movements_date'); })
    .alterTable('purchase_orders', (t) => { t.dropIndex([], 'idx_purchase_orders_status'); })
    .alterTable('customers', (t) => { t.dropIndex([], 'idx_customers_name'); t.dropIndex([], 'idx_customers_type'); })
    .alterTable('suppliers', (t) => { t.dropIndex([], 'idx_suppliers_name'); })
    .alterTable('employees', (t) => { t.dropIndex([], 'idx_employees_branch'); })
    .alterTable('attendance', (t) => { t.dropIndex([], 'idx_attendance_tenant'); })
    .alterTable('payroll', (t) => { t.dropIndex([], 'idx_payroll_status'); t.dropIndex([], 'idx_payroll_period'); })
    .alterTable('journal_entries', (t) => { t.dropIndex([], 'idx_journal_entries_ref'); })
    .alterTable('orders', (t) => { t.dropIndex([], 'idx_orders_type'); t.dropIndex([], 'idx_orders_customer'); })
    .alterTable('invoices', (t) => { t.dropIndex([], 'idx_invoices_customer'); });
};
