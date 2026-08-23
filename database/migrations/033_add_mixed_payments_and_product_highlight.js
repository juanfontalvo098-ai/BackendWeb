/**
 * Migration 033: Agregar soporte para pagos mixtos, cambio/vueltos,
 * transferencias declaradas en arqueo y producto destacado en órdenes
 */
exports.up = async function(knex) {
  // 1. invoices: agregar montos desglosados y cambio
  const hasInvoicesCashAmount = await knex.schema.hasColumn('invoices', 'cash_amount');
  if (!hasInvoicesCashAmount) {
    await knex.schema.alterTable('invoices', (table) => {
      table.decimal('cash_amount', 12, 2).defaultTo(0);
      table.decimal('transfer_amount', 12, 2).defaultTo(0);
      table.decimal('card_amount', 12, 2).defaultTo(0);
      table.decimal('amount_tendered', 12, 2).defaultTo(0);
      table.decimal('change_given', 12, 2).defaultTo(0);
    });
  }

  // 2. cash_registers: agregar declared_transfers
  const hasRegistersDeclaredTransfers = await knex.schema.hasColumn('cash_registers', 'declared_transfers');
  if (!hasRegistersDeclaredTransfers) {
    await knex.schema.alterTable('cash_registers', (table) => {
      table.decimal('declared_transfers', 12, 2).nullable();
    });
  }

  // 3. shift_reports: agregar declared_transfers
  const hasShiftDeclaredTransfers = await knex.schema.hasColumn('shift_reports', 'declared_transfers');
  if (!hasShiftDeclaredTransfers) {
    await knex.schema.alterTable('shift_reports', (table) => {
      table.decimal('declared_transfers', 12, 2).nullable();
    });
  }

  // 4. products: agregar show_in_order_stats
  const hasProductStatsCol = await knex.schema.hasColumn('products', 'show_in_order_stats');
  if (!hasProductStatsCol) {
    await knex.schema.alterTable('products', (table) => {
      table.boolean('show_in_order_stats').defaultTo(false);
    });
  }
};

exports.down = async function(knex) {
  const hasInvoicesCashAmount = await knex.schema.hasColumn('invoices', 'cash_amount');
  if (hasInvoicesCashAmount) {
    await knex.schema.alterTable('invoices', (table) => {
      table.dropColumn('cash_amount');
      table.dropColumn('transfer_amount');
      table.dropColumn('card_amount');
      table.dropColumn('amount_tendered');
      table.dropColumn('change_given');
    });
  }

  const hasRegistersDeclaredTransfers = await knex.schema.hasColumn('cash_registers', 'declared_transfers');
  if (hasRegistersDeclaredTransfers) {
    await knex.schema.alterTable('cash_registers', (table) => {
      table.dropColumn('declared_transfers');
    });
  }

  const hasShiftDeclaredTransfers = await knex.schema.hasColumn('shift_reports', 'declared_transfers');
  if (hasShiftDeclaredTransfers) {
    await knex.schema.alterTable('shift_reports', (table) => {
      table.dropColumn('declared_transfers');
    });
  }

  const hasProductStatsCol = await knex.schema.hasColumn('products', 'show_in_order_stats');
  if (hasProductStatsCol) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('show_in_order_stats');
    });
  }
};
