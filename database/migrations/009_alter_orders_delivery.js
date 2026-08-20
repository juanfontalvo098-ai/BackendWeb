/**
 * Migration 009: Modificar órdenes para soportar delivery/para llevar
 * - orders.table_id → NULLABLE (permite órdenes sin mesa)
 * - Agregar order_type, campos de delivery, descuentos
 * - Extender invoices con customer_id, descuentos, notas
 */
exports.up = async function(knex) {
  // 1. Alterar orders: hacer table_id nullable y agregar campos
  await knex.schema.alterTable('orders', (table) => {
    table.string('order_type', 30).defaultTo('mesa');
    table.text('delivery_address').nullable();
    table.string('delivery_phone', 50).nullable();
    table.text('delivery_notes').nullable();
    table.decimal('discount_amount', 12, 2).defaultTo(0);
    table.string('discount_type', 20).nullable();
  });

  // Hacer table_id nullable (requiere raw SQL ya que Knex no soporta ALTER COLUMN directamente)
  await knex.raw('ALTER TABLE orders ALTER COLUMN table_id DROP NOT NULL');

  // 2. Alterar invoices
  await knex.schema.alterTable('invoices', (table) => {
    table.decimal('discount_amount', 12, 2).defaultTo(0);
    table.text('notes').nullable();
  });
};

exports.down = async function(knex) {
  // Restaurar table_id NOT NULL (con valor default para registros existentes)
  await knex.raw('UPDATE orders SET table_id = 0 WHERE table_id IS NULL');
  await knex.raw('ALTER TABLE orders ALTER COLUMN table_id SET NOT NULL');

  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('order_type');
    table.dropColumn('delivery_address');
    table.dropColumn('delivery_phone');
    table.dropColumn('delivery_notes');
    table.dropColumn('discount_amount');
    table.dropColumn('discount_type');
  });

  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('discount_amount');
    table.dropColumn('notes');
  });
};
