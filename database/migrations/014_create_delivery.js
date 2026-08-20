/**
 * Migration 014: Crear tablas de delivery / domicilios
 * - delivery_zones: Zonas de cobertura con tarifa de envío
 * - delivery_assignments: Asignación de domiciliarios a órdenes
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('delivery_zones', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.decimal('delivery_fee', 12, 2).defaultTo(0);
      table.integer('estimated_time_mins').defaultTo(30);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id'], 'idx_delivery_zones_business');
    })
    .createTable('delivery_assignments', (table) => {
      table.increments('id').primary();
      table.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
      table.integer('driver_user_id').notNullable().references('id').inTable('users');
      table.integer('delivery_zone_id').nullable().references('id').inTable('delivery_zones');
      table.string('status', 30).defaultTo('asignado'); // asignado, en_camino, entregado, cancelado
      table.timestamp('assigned_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('picked_up_at', { useTz: true }).nullable();
      table.timestamp('delivered_at', { useTz: true }).nullable();
      table.text('notes').nullable();
      table.index(['order_id'], 'idx_delivery_assignments_order');
      table.index(['driver_user_id'], 'idx_delivery_assignments_driver');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('delivery_assignments')
    .dropTableIfExists('delivery_zones');
};
