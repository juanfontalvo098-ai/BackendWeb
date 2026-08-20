/**
 * Migration 011: Crear tablas de proveedores
 * - suppliers: Datos del proveedor
 * - supplier_products: Catálogo de productos por proveedor con precio de costo
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('suppliers', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('contact_name', 255).nullable();
      table.string('document_number', 50).nullable();
      table.string('email', 255).nullable();
      table.string('phone', 50).nullable();
      table.text('address').nullable();
      table.string('city', 100).nullable();
      table.string('payment_terms', 100).defaultTo('contado');
      table.text('notes').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id'], 'idx_suppliers_business');
    })
    .createTable('supplier_products', (table) => {
      table.increments('id').primary();
      table.integer('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.string('supplier_sku', 50).nullable();
      table.decimal('cost_price', 12, 2).notNullable();
      table.integer('lead_time_days').defaultTo(1);
      table.unique(['supplier_id', 'product_id']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('supplier_products')
    .dropTableIfExists('suppliers');
};
