/**
 * Migration 025: Allow supplies in purchase_order_items
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('purchase_order_items');
  if (hasTable) {
    await knex.schema.alterTable('purchase_order_items', (table) => {
      table.integer('product_id').nullable().alter();
    });

    const hasItemType = await knex.schema.hasColumn('purchase_order_items', 'item_type');
    if (!hasItemType) {
      await knex.schema.alterTable('purchase_order_items', (table) => {
        table.string('item_type', 20).defaultTo('insumo'); // 'insumo' | 'producto'
      });
    }
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('purchase_order_items');
  if (hasTable) {
    const hasItemType = await knex.schema.hasColumn('purchase_order_items', 'item_type');
    if (hasItemType) {
      await knex.schema.alterTable('purchase_order_items', (table) => {
        table.dropColumn('item_type');
      });
    }
  }
};
