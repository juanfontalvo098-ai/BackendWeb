/**
 * Migration 005: Crear tablas financieras
 * - cash_registers (cajas registradoras por sucursal)
 * - cash_movements (movimientos de caja)
 * - invoices (facturas por sucursal)
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('cash_registers', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.decimal('opening_amount', 12, 2).notNullable();
      table.decimal('closing_amount', 12, 2);
      table.decimal('expected_amount', 12, 2);
      table.decimal('difference', 12, 2);
      table.string('status', 20).defaultTo('abierta');
      table.timestamp('opened_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('closed_at', { useTz: true });
    })
    .createTable('cash_movements', (table) => {
      table.increments('id').primary();
      table.integer('cash_register_id').notNullable().references('id').inTable('cash_registers').onDelete('CASCADE');
      table.string('type', 30).notNullable();
      table.decimal('amount', 12, 2).notNullable();
      table.string('payment_method', 30).defaultTo('efectivo');
      table.text('description');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    })
    .createTable('invoices', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('order_id').notNullable().references('id').inTable('orders');
      table.integer('cash_register_id').notNullable().references('id').inTable('cash_registers');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.decimal('subtotal', 12, 2).notNullable();
      table.decimal('tax_total', 12, 2).notNullable();
      table.decimal('tip_percentage', 5, 4).defaultTo(0);
      table.decimal('tip_amount', 12, 2).defaultTo(0);
      table.decimal('total', 12, 2).notNullable();
      table.string('payment_method', 30).notNullable();
      table.string('invoice_number', 50).unique().notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('invoices')
    .dropTableIfExists('cash_movements')
    .dropTableIfExists('cash_registers');
};
