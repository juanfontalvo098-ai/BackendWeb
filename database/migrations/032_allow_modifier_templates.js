/**
 * Migration 032: Permitir plantillas reutilizables de grupos de modificadores
 * - product_id ahora es nullable para grupos globales/plantillas
 * - is_template boolean
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('product_modifier_groups', (table) => {
    table.integer('product_id').nullable().alter();
    table.boolean('is_template').defaultTo(false);
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('product_modifier_groups', (table) => {
    table.dropColumn('is_template');
  });
};
