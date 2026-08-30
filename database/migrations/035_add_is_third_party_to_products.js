/**
 * Migration 035: Agregar soporte para "Producto de Tercero / Socio"
 *
 * - products.is_third_party: Marca un producto como de un negocio socio/tercero.
 *   Las ventas de estos productos se registran normalmente pero NO se contabilizan
 *   en el facturado ni en la ganancia del negocio.
 *
 * - order_items.is_third_party: Se copia del producto al momento de crear el ítem,
 *   para mantener un registro histórico inmutable (si después el producto cambia de marca,
 *   las ventas anteriores mantienen su estado original).
 *
 * - invoices.third_party_total: Monto total de ítems de terceros en la factura,
 *   para desglosar fácilmente sin recalcular.
 */
exports.up = async function(knex) {
  // 1. products: agregar is_third_party
  const hasProductsCol = await knex.schema.hasColumn('products', 'is_third_party');
  if (!hasProductsCol) {
    await knex.schema.alterTable('products', (table) => {
      table.boolean('is_third_party').defaultTo(false);
    });
  }

  // 2. order_items: agregar is_third_party
  const hasOrderItemsCol = await knex.schema.hasColumn('order_items', 'is_third_party');
  if (!hasOrderItemsCol) {
    await knex.schema.alterTable('order_items', (table) => {
      table.boolean('is_third_party').defaultTo(false);
    });
  }

  // 3. invoices: agregar third_party_total
  const hasInvoicesCol = await knex.schema.hasColumn('invoices', 'third_party_total');
  if (!hasInvoicesCol) {
    await knex.schema.alterTable('invoices', (table) => {
      table.decimal('third_party_total', 12, 2).defaultTo(0);
    });
  }

  // 4. shift_reports: agregar third_party_revenue
  const hasShiftCol = await knex.schema.hasColumn('shift_reports', 'third_party_revenue');
  if (!hasShiftCol) {
    await knex.schema.alterTable('shift_reports', (table) => {
      table.decimal('third_party_revenue', 12, 2).defaultTo(0);
    });
  }
};

exports.down = async function(knex) {
  const hasProductsCol = await knex.schema.hasColumn('products', 'is_third_party');
  if (hasProductsCol) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('is_third_party');
    });
  }

  const hasOrderItemsCol = await knex.schema.hasColumn('order_items', 'is_third_party');
  if (hasOrderItemsCol) {
    await knex.schema.alterTable('order_items', (table) => {
      table.dropColumn('is_third_party');
    });
  }

  const hasInvoicesCol = await knex.schema.hasColumn('invoices', 'third_party_total');
  if (hasInvoicesCol) {
    await knex.schema.alterTable('invoices', (table) => {
      table.dropColumn('third_party_total');
    });
  }

  const hasShiftCol = await knex.schema.hasColumn('shift_reports', 'third_party_revenue');
  if (hasShiftCol) {
    await knex.schema.alterTable('shift_reports', (table) => {
      table.dropColumn('third_party_revenue');
    });
  }
};
