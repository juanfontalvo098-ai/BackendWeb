/**
 * Migration 029: Agregar cash_register_id a tabla orders
 * Permite asociar cada orden al turno de caja en el que fue generada
 */
exports.up = async function(knex) {
  const hasCol = await knex.schema.hasColumn('orders', 'cash_register_id');
  if (!hasCol) {
    await knex.schema.alterTable('orders', (table) => {
      table.integer('cash_register_id').nullable().references('id').inTable('cash_registers').onDelete('SET NULL');
    });

    // Backfill desde invoices
    await knex.raw(`
      UPDATE orders
      SET cash_register_id = invoices.cash_register_id
      FROM invoices
      WHERE invoices.order_id = orders.id
      AND orders.cash_register_id IS NULL
    `);

    // Backfill para órdenes sin factura basadas en fecha y sucursal
    await knex.raw(`
      UPDATE orders o
      SET cash_register_id = cr.id
      FROM cash_registers cr
      WHERE o.cash_register_id IS NULL
      AND o.branch_id = cr.branch_id
      AND o.created_at >= cr.opened_at
      AND (cr.closed_at IS NULL OR o.created_at <= cr.closed_at)
    `);
  }
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('cash_register_id');
  });
};
