/**
 * Migration 024: Crear tabla supply_categories para gestión dinámica de categorías de insumos
 */
exports.up = async function(knex) {
  await knex.schema
    .createTable('supply_categories', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.text('description').nullable();
      table.string('color', 30).defaultTo('#3b82f6');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'name']);
      table.index(['business_id'], 'idx_supply_cats_business');
    });

  await knex.schema.alterTable('supplies', (table) => {
    table.integer('category_id').nullable().references('id').inTable('supply_categories').onDelete('SET NULL');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('supplies', (table) => {
    table.dropColumn('category_id');
  });
  await knex.schema.dropTableIfExists('supply_categories');
};
