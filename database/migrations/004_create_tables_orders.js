/**
 * Migration 004: Crear tablas operativas (mesas, órdenes, items de orden)
 * - tables_restaurant: siempre pertenecen a una sucursal (branch_id NOT NULL)
 * - orders: siempre en una sucursal
 * - order_items: heredan tenant del order (sin business_id/branch_id propio)
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('tables_restaurant', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.string('table_number', 50).notNullable();
      table.integer('capacity').defaultTo(4);
      table.string('status', 30).defaultTo('libre');
      table.string('zone', 50).defaultTo('interior');
      table.unique(['branch_id', 'table_number']);
    })
    .createTable('orders', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('table_id').notNullable().references('id').inTable('tables_restaurant');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('status', 30).defaultTo('abierta');
      table.integer('guests').defaultTo(1);
      table.text('notes');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    })
    .createTable('order_items', (table) => {
      table.increments('id').primary();
      table.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products');
      table.integer('quantity').notNullable().defaultTo(1);
      table.decimal('unit_price', 12, 2).notNullable();
      table.decimal('tax_rate', 5, 4).defaultTo(0.0);
      table.boolean('tax_included').defaultTo(true);
      table.text('notes');
      table.string('status', 30).defaultTo('pendiente');
      table.timestamp('sent_to_kitchen_at', { useTz: true });
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('order_items')
    .dropTableIfExists('orders')
    .dropTableIfExists('tables_restaurant');
};
