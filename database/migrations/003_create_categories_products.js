/**
 * Migration 003: Crear tablas de catálogo (categorías y productos)
 * - Ambas con business_id obligatorio
 * - branch_id nullable (NULL = disponible en todas las sucursales)
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('categories', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.string('name', 255).notNullable();
      table.text('description');
      table.integer('sort_order').defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    })
    .createTable('products', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.integer('category_id').notNullable().references('id').inTable('categories');
      table.string('name', 255).notNullable();
      table.text('description');
      table.decimal('price', 12, 2).notNullable();
      table.decimal('tax_rate', 5, 4).defaultTo(0.0);
      table.boolean('tax_included').defaultTo(true);
      table.boolean('is_available').defaultTo(true);
      table.text('image_url');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('products')
    .dropTableIfExists('categories');
};
