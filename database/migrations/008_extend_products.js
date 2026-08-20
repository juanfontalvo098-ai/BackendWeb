/**
 * Migration 008: Extender tabla de productos para ERP
 * - cost_price: Precio de costo (para calcular margen)
 * - barcode: Código de barras
 * - sku: SKU interno
 * - unit_of_measure: Unidad de medida (unidad, kg, litro, etc.)
 * - track_inventory: Si se debe controlar stock
 * - min_stock: Stock mínimo para alertas
 */
exports.up = function(knex) {
  return knex.schema.alterTable('products', (table) => {
    table.decimal('cost_price', 12, 2).nullable().defaultTo(0);
    table.string('barcode', 100).nullable();
    table.string('sku', 50).nullable();
    table.string('unit_of_measure', 30).defaultTo('unidad');
    table.boolean('track_inventory').defaultTo(false);
    table.integer('min_stock').defaultTo(0);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('products', (table) => {
    table.dropColumn('cost_price');
    table.dropColumn('barcode');
    table.dropColumn('sku');
    table.dropColumn('unit_of_measure');
    table.dropColumn('track_inventory');
    table.dropColumn('min_stock');
  });
};
