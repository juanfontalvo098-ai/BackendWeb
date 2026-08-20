/**
 * Migration 028: Agregar configuración de impresión silenciosa y auto-impresión remota a settings
 */
exports.up = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.boolean('enable_silent_printing').defaultTo(false);
    table.boolean('auto_print_kitchen_tickets').defaultTo(true);
    table.boolean('auto_print_invoices').defaultTo(false);
    table.string('silent_print_bridge_url', 100).defaultTo('http://localhost:8088');
    table.string('printer_kitchen_name', 100).nullable();
    table.string('printer_receipt_name', 100).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('settings', (table) => {
    table.dropColumn('enable_silent_printing');
    table.dropColumn('auto_print_kitchen_tickets');
    table.dropColumn('auto_print_invoices');
    table.dropColumn('silent_print_bridge_url');
    table.dropColumn('printer_kitchen_name');
    table.dropColumn('printer_receipt_name');
  });
};
