/**
 * Migration 010: Crear tabla de clientes (CRM)
 * - Registro de clientes con datos fiscales
 * - Puntos de fidelización
 * - Crédito (cuenta por cobrar informal)
 * - Segmentación por tipo
 */
exports.up = function(knex) {
  return knex.schema.createTable('customers', (table) => {
    table.increments('id').primary();
    table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
    table.string('document_type', 20).defaultTo('CC');
    table.string('document_number', 50).nullable();
    table.string('name', 255).notNullable();
    table.string('email', 255).nullable();
    table.string('phone', 50).nullable();
    table.text('address').nullable();
    table.string('city', 100).nullable();
    table.text('notes').nullable();
    table.integer('loyalty_points').defaultTo(0);
    table.decimal('credit_limit', 12, 2).defaultTo(0);
    table.decimal('credit_balance', 12, 2).defaultTo(0);
    table.string('customer_type', 30).defaultTo('regular');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.unique(['business_id', 'document_number']);
    table.index(['business_id'], 'idx_customers_business');
  }).then(() => {
    // Agregar FK de customer_id en orders e invoices
    return knex.schema.alterTable('orders', (table) => {
      table.integer('customer_id').nullable().references('id').inTable('customers').onDelete('SET NULL');
    });
  }).then(() => {
    return knex.schema.alterTable('invoices', (table) => {
      table.integer('customer_id').nullable().references('id').inTable('customers').onDelete('SET NULL');
    });
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('customer_id');
  });
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('customer_id');
  });
  await knex.schema.dropTableIfExists('customers');
};
