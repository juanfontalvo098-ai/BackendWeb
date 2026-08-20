/**
 * Migration 019: Agregar delivery_fee en orders e invoices
 */
exports.up = async function(knex) {
  const hasOrdersDeliveryFee = await knex.schema.hasColumn('orders', 'delivery_fee');
  if (!hasOrdersDeliveryFee) {
    await knex.schema.alterTable('orders', (table) => {
      table.decimal('delivery_fee', 12, 2).defaultTo(0);
    });
  }

  const hasInvoicesDeliveryFee = await knex.schema.hasColumn('invoices', 'delivery_fee');
  if (!hasInvoicesDeliveryFee) {
    await knex.schema.alterTable('invoices', (table) => {
      table.decimal('delivery_fee', 12, 2).defaultTo(0);
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('delivery_fee');
  });
  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('delivery_fee');
  });
};
