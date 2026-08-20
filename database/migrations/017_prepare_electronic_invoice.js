/**
 * Migration 017: Preparar infraestructura para facturación electrónica
 * - invoice_sequences: Control de numeración por tipo de documento
 * - credit_notes: Notas crédito
 * - debit_notes: Notas débito
 * 
 * NOTA: Solo se prepara la estructura. La integración con DIAN se implementará luego.
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('invoice_sequences', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('CASCADE');
      table.string('document_type', 30).notNullable(); // factura, nota_credito, nota_debito
      table.string('prefix', 10).notNullable();
      table.integer('current_number').defaultTo(0);
      table.string('resolution_number', 50).nullable();
      table.date('resolution_date').nullable();
      table.integer('range_start').nullable();
      table.integer('range_end').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'branch_id', 'document_type', 'prefix']);
    })
    .createTable('credit_notes', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('invoice_id').notNullable().references('id').inTable('invoices');
      table.integer('customer_id').nullable().references('id').inTable('customers').onDelete('SET NULL');
      table.string('credit_note_number', 50).notNullable();
      table.text('reason').notNullable();
      table.decimal('subtotal', 12, 2).notNullable();
      table.decimal('tax_total', 12, 2).notNullable();
      table.decimal('total', 12, 2).notNullable();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'credit_note_number']);
    })
    .createTable('debit_notes', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('invoice_id').notNullable().references('id').inTable('invoices');
      table.integer('customer_id').nullable().references('id').inTable('customers').onDelete('SET NULL');
      table.string('debit_note_number', 50).notNullable();
      table.text('reason').notNullable();
      table.decimal('subtotal', 12, 2).notNullable();
      table.decimal('tax_total', 12, 2).notNullable();
      table.decimal('total', 12, 2).notNullable();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'debit_note_number']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('debit_notes')
    .dropTableIfExists('credit_notes')
    .dropTableIfExists('invoice_sequences');
};
