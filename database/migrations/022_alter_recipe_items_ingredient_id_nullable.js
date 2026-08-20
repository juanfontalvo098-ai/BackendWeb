/**
 * Migration 022: Hacer que ingredient_id en recipe_items sea nullable para permitir insumos puros
 */
exports.up = function(knex) {
  return knex.schema.alterTable('recipe_items', (table) => {
    table.integer('ingredient_id').nullable().alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('recipe_items', (table) => {
    table.integer('ingredient_id').notNullable().alter();
  });
};
