/**
 * Migration 015: Crear tablas de contabilidad / finanzas
 * - chart_of_accounts: Plan de cuentas contable
 * - journal_entries: Libro diario
 * - journal_entry_lines: Líneas de asientos contables
 * - accounts_receivable: Cuentas por cobrar
 * - accounts_payable: Cuentas por pagar
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('chart_of_accounts', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('code', 20).notNullable();
      table.string('name', 255).notNullable();
      table.string('account_type', 30).notNullable(); // activo, pasivo, patrimonio, ingreso, gasto
      table.integer('parent_id').nullable().references('id').inTable('chart_of_accounts').onDelete('SET NULL');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'code']);
      table.index(['business_id'], 'idx_coa_business');
    })
    .createTable('journal_entries', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.string('entry_number', 50).notNullable();
      table.date('entry_date').notNullable();
      table.text('description').nullable();
      table.string('reference_type', 50).nullable(); // invoice, purchase_order, cash_movement, payroll, manual
      table.integer('reference_id').nullable();
      table.string('status', 20).defaultTo('borrador'); // borrador, aprobado, anulado
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'entry_number']);
      table.index(['business_id', 'entry_date'], 'idx_journal_entries_date');
    })
    .createTable('journal_entry_lines', (table) => {
      table.increments('id').primary();
      table.integer('journal_entry_id').notNullable().references('id').inTable('journal_entries').onDelete('CASCADE');
      table.integer('account_id').notNullable().references('id').inTable('chart_of_accounts');
      table.decimal('debit', 12, 2).defaultTo(0);
      table.decimal('credit', 12, 2).defaultTo(0);
      table.text('description').nullable();
    })
    .createTable('accounts_receivable', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.integer('customer_id').notNullable().references('id').inTable('customers');
      table.integer('invoice_id').nullable().references('id').inTable('invoices').onDelete('SET NULL');
      table.decimal('amount', 12, 2).notNullable();
      table.decimal('paid_amount', 12, 2).defaultTo(0);
      table.decimal('balance', 12, 2).notNullable();
      table.date('due_date').notNullable();
      table.string('status', 20).defaultTo('pendiente'); // pendiente, parcial, pagada, vencida
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'customer_id'], 'idx_ar_customer');
      table.index(['status'], 'idx_ar_status');
    })
    .createTable('accounts_payable', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.integer('supplier_id').notNullable().references('id').inTable('suppliers');
      table.integer('purchase_order_id').nullable().references('id').inTable('purchase_orders').onDelete('SET NULL');
      table.decimal('amount', 12, 2).notNullable();
      table.decimal('paid_amount', 12, 2).defaultTo(0);
      table.decimal('balance', 12, 2).notNullable();
      table.date('due_date').notNullable();
      table.string('status', 20).defaultTo('pendiente'); // pendiente, parcial, pagada, vencida
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'supplier_id'], 'idx_ap_supplier');
      table.index(['status'], 'idx_ap_status');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('accounts_payable')
    .dropTableIfExists('accounts_receivable')
    .dropTableIfExists('journal_entry_lines')
    .dropTableIfExists('journal_entries')
    .dropTableIfExists('chart_of_accounts');
};
