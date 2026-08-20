/**
 * Migration 020: Agregar régimen tributario a tabla settings
 * Permite seleccionar:
 * - 'impoconsumo' (Responsable de Impuesto al Consumo - 8%)
 * - 'iva' (Responsable de IVA)
 * - 'no_responsable' (No Responsable de IVA / Impoconsumo)
 * - 'ambos' (Responsable de IVA e Impoconsumo)
 */
exports.up = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.string('tax_regime', 50).defaultTo('impoconsumo');
    table.string('economic_activity_code', 50).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.dropColumn('tax_regime');
    table.dropColumn('economic_activity_code');
  });
};
