/**
 * Migration 031: Crear tablas para modificadores, sabores y toppings de productos
 * - product_modifier_groups: Grupos de opciones (ej. "Sabores de Helado", "Toppings", "Salsas")
 * - product_modifier_options: Opciones individuales con precio adicional y enlace a insumos de inventario
 * - order_items: columna modifiers_json para registrar los modificadores elegidos
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('product_modifier_groups', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.integer('min_selectable').defaultTo(0);
      table.integer('max_selectable').defaultTo(1);
      table.boolean('is_required').defaultTo(false);
      table.boolean('is_multiple').defaultTo(false);
      table.integer('display_order').defaultTo(0);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'product_id'], 'idx_mod_groups_prod');
    })
    .createTable('product_modifier_options', (table) => {
      table.increments('id').primary();
      table.integer('group_id').notNullable().references('id').inTable('product_modifier_groups').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.decimal('price_modifier', 12, 2).defaultTo(0.00);
      table.integer('supply_id').nullable().references('id').inTable('supplies').onDelete('SET NULL');
      table.decimal('supply_quantity', 12, 4).defaultTo(0.0000);
      table.string('unit_of_measure', 30).defaultTo('unidad');
      table.boolean('is_available').defaultTo(true);
      table.integer('display_order').defaultTo(0);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['group_id'], 'idx_mod_options_group');
    })
    .table('order_items', (table) => {
      table.jsonb('modifiers_json').nullable();
    });
};

exports.down = function(knex) {
  return knex.schema
    .table('order_items', (table) => {
      table.dropColumn('modifiers_json');
    })
    .dropTableIfExists('product_modifier_options')
    .dropTableIfExists('product_modifier_groups');
};
