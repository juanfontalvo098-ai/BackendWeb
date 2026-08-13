/**
 * Migration 007: Crear índices de performance para filtrado multi-tenant
 * Estos índices son críticos para que las queries filtradas por tenant sean rápidas.
 */
exports.up = function(knex) {
  return knex.schema
    // Índices de usuarios
    .alterTable('users', (table) => {
      table.index(['business_id'], 'idx_users_business');
      table.index(['business_id', 'branch_id'], 'idx_users_branch');
    })
    // Índices de catálogo
    .alterTable('categories', (table) => {
      table.index(['business_id'], 'idx_categories_business');
    })
    .alterTable('products', (table) => {
      table.index(['business_id'], 'idx_products_business');
      table.index(['business_id', 'category_id'], 'idx_products_category');
    })
    // Índices operativos
    .alterTable('tables_restaurant', (table) => {
      table.index(['branch_id'], 'idx_tables_branch');
    })
    .alterTable('orders', (table) => {
      table.index(['branch_id'], 'idx_orders_branch');
      table.index(['branch_id', 'status'], 'idx_orders_branch_status');
      table.index(['table_id', 'status'], 'idx_orders_table_status');
    })
    // Índices financieros
    .alterTable('invoices', (table) => {
      table.index(['branch_id'], 'idx_invoices_branch');
      table.index(['branch_id', 'created_at'], 'idx_invoices_branch_date');
    })
    .alterTable('cash_registers', (table) => {
      table.index(['branch_id', 'status'], 'idx_cash_registers_branch_status');
    })
    // Índices auxiliares
    .alterTable('kitchen_tickets', (table) => {
      table.index(['branch_id', 'status'], 'idx_kitchen_tickets_branch_status');
    })
    .alterTable('shift_reports', (table) => {
      table.index(['branch_id'], 'idx_shift_reports_branch');
    });
};

exports.down = function(knex) {
  return knex.schema
    .alterTable('users', (t) => { t.dropIndex([], 'idx_users_business'); t.dropIndex([], 'idx_users_branch'); })
    .alterTable('categories', (t) => { t.dropIndex([], 'idx_categories_business'); })
    .alterTable('products', (t) => { t.dropIndex([], 'idx_products_business'); t.dropIndex([], 'idx_products_category'); })
    .alterTable('tables_restaurant', (t) => { t.dropIndex([], 'idx_tables_branch'); })
    .alterTable('orders', (t) => { t.dropIndex([], 'idx_orders_branch'); t.dropIndex([], 'idx_orders_branch_status'); t.dropIndex([], 'idx_orders_table_status'); })
    .alterTable('invoices', (t) => { t.dropIndex([], 'idx_invoices_branch'); t.dropIndex([], 'idx_invoices_branch_date'); })
    .alterTable('cash_registers', (t) => { t.dropIndex([], 'idx_cash_registers_branch_status'); })
    .alterTable('kitchen_tickets', (t) => { t.dropIndex([], 'idx_kitchen_tickets_branch_status'); })
    .alterTable('shift_reports', (t) => { t.dropIndex([], 'idx_shift_reports_branch'); });
};
