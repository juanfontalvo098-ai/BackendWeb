/**
 * Migration 013: Crear tablas de descuentos, cupones y listas de precios
 * - discounts: Descuentos configurables (%, fijo, combo, happy hour)
 * - coupons: Códigos de cupón con límite de uso
 * - price_lists: Listas de precios diferenciadas
 * - price_list_items: Precios personalizados por producto
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('discounts', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('discount_type', 20).notNullable(); // percentage, fixed_amount, combo
      table.decimal('value', 12, 2).notNullable();
      table.string('applies_to', 20).notNullable().defaultTo('order'); // product, category, order, customer_type
      table.integer('target_id').nullable(); // product_id o category_id
      table.decimal('min_purchase', 12, 2).defaultTo(0);
      table.decimal('max_discount', 12, 2).nullable();
      table.timestamp('start_date', { useTz: true }).nullable();
      table.timestamp('end_date', { useTz: true }).nullable();
      table.time('start_time').nullable(); // Happy hour
      table.time('end_time').nullable();
      table.jsonb('days_of_week').nullable(); // [1,2,3,4,5]
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id'], 'idx_discounts_business');
    })
    .createTable('coupons', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('code', 50).notNullable();
      table.integer('discount_id').notNullable().references('id').inTable('discounts').onDelete('CASCADE');
      table.integer('max_uses').nullable();
      table.integer('used_count').defaultTo(0);
      table.timestamp('valid_from', { useTz: true }).notNullable();
      table.timestamp('valid_until', { useTz: true }).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'code']);
    })
    .createTable('price_lists', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.boolean('is_default').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    })
    .createTable('price_list_items', (table) => {
      table.increments('id').primary();
      table.integer('price_list_id').notNullable().references('id').inTable('price_lists').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.decimal('custom_price', 12, 2).notNullable();
      table.unique(['price_list_id', 'product_id']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('price_list_items')
    .dropTableIfExists('price_lists')
    .dropTableIfExists('coupons')
    .dropTableIfExists('discounts');
};
