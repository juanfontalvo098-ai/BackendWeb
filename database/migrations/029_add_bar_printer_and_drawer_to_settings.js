/**
 * Migration 029: Agregar printer_bar_name y open_drawer_on_payment a la tabla settings
 */
exports.up = async function(knex) {
  const hasBar = await knex.schema.hasColumn('settings', 'printer_bar_name');
  if (!hasBar) {
    await knex.schema.alterTable('settings', (table) => {
      table.string('printer_bar_name', 100).nullable();
    });
  }

  const hasDrawer = await knex.schema.hasColumn('settings', 'open_drawer_on_payment');
  if (!hasDrawer) {
    await knex.schema.alterTable('settings', (table) => {
      table.boolean('open_drawer_on_payment').defaultTo(true);
    });
  }
};

exports.down = async function(knex) {
  const hasBar = await knex.schema.hasColumn('settings', 'printer_bar_name');
  if (hasBar) {
    await knex.schema.alterTable('settings', (table) => {
      table.dropColumn('printer_bar_name');
    });
  }

  const hasDrawer = await knex.schema.hasColumn('settings', 'open_drawer_on_payment');
  if (hasDrawer) {
    await knex.schema.alterTable('settings', (table) => {
      table.dropColumn('open_drawer_on_payment');
    });
  }
};
