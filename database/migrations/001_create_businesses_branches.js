/**
 * Migration 001: Crear tablas de infraestructura multi-tenant
 * - businesses (negocios/tenants principales)
 * - branches (sucursales por negocio)
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('businesses', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 255).notNullable();
      table.string('slug', 100).unique().notNullable();
      table.string('nit', 50);
      table.string('business_type', 50).notNullable().defaultTo('restaurant');
      table.text('logo_url');
      table.boolean('is_active').defaultTo(true);
      table.string('plan', 50).defaultTo('free');
      table.integer('max_branches').defaultTo(1);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    })
    .createTable('branches', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('code', 20).notNullable();
      table.text('address');
      table.string('phone', 50);
      table.string('timezone', 50).defaultTo('America/Bogota');
      table.boolean('is_active').defaultTo(true);
      table.text('receipt_footer').defaultTo('¡Gracias por su preferencia!');
      table.string('default_paper_width', 10).defaultTo('80mm');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'code']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('branches')
    .dropTableIfExists('businesses');
};
