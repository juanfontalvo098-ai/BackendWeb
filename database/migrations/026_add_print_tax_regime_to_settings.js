/**
 * Migration 026: Agregar print_tax_regime y custom_tax_regime_text a la tabla settings
 */
exports.up = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.boolean('print_tax_regime').defaultTo(true);
    table.string('custom_tax_regime_text', 150).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.dropColumn('print_tax_regime');
    table.dropColumn('custom_tax_regime_text');
  });
};
