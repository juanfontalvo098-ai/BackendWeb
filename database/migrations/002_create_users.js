/**
 * Migration 002: Crear tabla de usuarios multi-tenant
 * - users pertenecen a un business_id
 * - branch_id nullable (NULL = acceso a todas las sucursales del negocio)
 * - Roles expandidos: super_admin, admin, gerente, cajero, mesero, cocinero
 */
exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
    table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
    table.string('username', 100).notNullable();
    table.text('password_hash').notNullable();
    table.string('full_name', 255).notNullable();
    table.string('role', 30).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.jsonb('permissions');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.unique(['business_id', 'username']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('users');
};
