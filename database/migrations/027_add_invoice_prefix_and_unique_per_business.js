/**
 * Migration 027: Agregar invoice_prefix a settings y asegurar unicidad de invoice_number por business_id
 */
exports.up = async function(knex) {
  const hasCol = await knex.schema.hasColumn('settings', 'invoice_prefix');
  if (!hasCol) {
    await knex.schema.alterTable('settings', (table) => {
      table.string('invoice_prefix', 20).defaultTo('FAC');
    });
  }

  try {
    await knex.raw('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique;');
  } catch (e) {
    console.log('Nota: invoices_invoice_number_unique ya no existe');
  }

  try {
    await knex.raw('ALTER TABLE invoices ADD CONSTRAINT invoices_business_invoice_unique UNIQUE (business_id, invoice_number);');
  } catch (e) {
    console.log('Nota: invoices_business_invoice_unique ya existía');
  }
};

exports.down = async function(knex) {
  await knex.schema.alterTable('settings', (table) => {
    table.dropColumn('invoice_prefix');
  });
  try {
    await knex.raw('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_business_invoice_unique;');
  } catch (e) {}
};
