/**
 * Migration 006: Crear tablas auxiliares
 * - kitchen_tickets (tickets de cocina por sucursal)
 * - settings (configuración por negocio con override por sucursal)
 * - shift_reports (reportes de turno por sucursal)
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('kitchen_tickets', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('order_id').notNullable().references('id').inTable('orders');
      table.string('table_number', 50).notNullable();
      table.string('status', 30).defaultTo('pendiente');
      table.jsonb('items_json').notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('completed_at', { useTz: true });
    })
    .createTable('settings', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('CASCADE');
      table.string('business_name', 255).defaultTo('GastrosPOS Enterprise');
      table.string('nit', 50);
      table.text('address');
      table.string('phone', 50);
      table.text('receipt_footer').defaultTo('¡Gracias por su preferencia!');
      table.text('logo_url').defaultTo('');
      table.string('default_paper_width', 10).defaultTo('80mm');
      table.unique(['business_id', 'branch_id']);
    })
    .createTable('shift_reports', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('cash_register_id').notNullable().unique().references('id').inTable('cash_registers');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('user_name', 255).notNullable();
      table.string('shift_name', 100).notNullable();
      table.timestamp('opened_at', { useTz: true }).notNullable();
      table.timestamp('closed_at', { useTz: true }).notNullable();
      table.decimal('opening_amount', 12, 2).notNullable();
      table.decimal('closing_amount', 12, 2).notNullable();
      table.decimal('expected_amount', 12, 2).notNullable();
      table.decimal('difference', 12, 2).notNullable();
      table.decimal('gross_revenue', 12, 2).notNullable();
      table.decimal('net_revenue', 12, 2).notNullable();
      table.decimal('tax_total', 12, 2).notNullable();
      table.decimal('total_tips', 12, 2).notNullable();
      table.integer('total_tickets').notNullable();
      table.decimal('cash_sales', 12, 2).notNullable();
      table.decimal('card_sales', 12, 2).notNullable();
      table.decimal('transfer_sales', 12, 2).notNullable();
      table.decimal('total_withdrawals', 12, 2).notNullable();
      table.decimal('total_voids', 12, 2).notNullable();
      table.jsonb('snapshot_json').notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('shift_reports')
    .dropTableIfExists('settings')
    .dropTableIfExists('kitchen_tickets');
};
