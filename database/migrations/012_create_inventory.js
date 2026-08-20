/**
 * Migration 012: Crear tablas de inventario completo
 * - inventory: Stock actual por producto/sucursal
 * - inventory_movements: Kardex / historial de movimientos
 * - purchase_orders: Órdenes de compra a proveedores
 * - purchase_order_items: Detalle de OC
 * - recipes: Recetas / Bill of Materials
 * - recipe_items: Ingredientes de recetas
 * - stock_counts: Conteo de inventario físico
 * - stock_count_items: Detalle del conteo
 */
exports.up = function(knex) {
  return knex.schema
    // Stock actual
    .createTable('inventory', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.decimal('quantity', 12, 3).defaultTo(0);
      table.decimal('reserved_quantity', 12, 3).defaultTo(0);
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['branch_id', 'product_id']);
      table.index(['business_id', 'branch_id'], 'idx_inventory_tenant');
    })
    // Kardex / Historial de movimientos
    .createTable('inventory_movements', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.string('movement_type', 30).notNullable(); // entrada, salida, ajuste, transferencia_in, transferencia_out, merma, venta
      table.decimal('quantity', 12, 3).notNullable();
      table.decimal('unit_cost', 12, 2).nullable();
      table.decimal('balance_after', 12, 3).notNullable();
      table.string('reference_type', 50).nullable(); // purchase_order, invoice, adjustment, transfer, stock_count
      table.integer('reference_id').nullable();
      table.text('notes').nullable();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'branch_id', 'product_id'], 'idx_inv_movements_product');
      table.index(['reference_type', 'reference_id'], 'idx_inv_movements_ref');
    })
    // Órdenes de compra
    .createTable('purchase_orders', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('supplier_id').notNullable().references('id').inTable('suppliers');
      table.string('order_number', 50).notNullable();
      table.string('status', 30).defaultTo('borrador'); // borrador, enviada, parcial, recibida, cancelada
      table.date('order_date').notNullable();
      table.date('expected_date').nullable();
      table.date('received_date').nullable();
      table.decimal('subtotal', 12, 2).defaultTo(0);
      table.decimal('tax_total', 12, 2).defaultTo(0);
      table.decimal('total', 12, 2).defaultTo(0);
      table.text('notes').nullable();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'order_number']);
      table.index(['business_id', 'branch_id'], 'idx_purchase_orders_tenant');
      table.index(['supplier_id'], 'idx_purchase_orders_supplier');
    })
    .createTable('purchase_order_items', (table) => {
      table.increments('id').primary();
      table.integer('purchase_order_id').notNullable().references('id').inTable('purchase_orders').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products');
      table.decimal('quantity_ordered', 12, 3).notNullable();
      table.decimal('quantity_received', 12, 3).defaultTo(0);
      table.decimal('unit_cost', 12, 2).notNullable();
      table.decimal('subtotal', 12, 2).notNullable();
    })
    // Recetas / Bill of Materials
    .createTable('recipes', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.decimal('yield_quantity', 12, 3).defaultTo(1);
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['business_id', 'product_id']);
    })
    .createTable('recipe_items', (table) => {
      table.increments('id').primary();
      table.integer('recipe_id').notNullable().references('id').inTable('recipes').onDelete('CASCADE');
      table.integer('ingredient_id').notNullable().references('id').inTable('products');
      table.decimal('quantity', 12, 3).notNullable();
      table.string('unit_of_measure', 30).defaultTo('unidad');
    })
    // Conteo de inventario
    .createTable('stock_counts', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('status', 30).defaultTo('en_proceso'); // en_proceso, completado, cancelado
      table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('completed_at', { useTz: true }).nullable();
      table.text('notes').nullable();
    })
    .createTable('stock_count_items', (table) => {
      table.increments('id').primary();
      table.integer('stock_count_id').notNullable().references('id').inTable('stock_counts').onDelete('CASCADE');
      table.integer('product_id').notNullable().references('id').inTable('products');
      table.decimal('system_quantity', 12, 3).notNullable();
      table.decimal('counted_quantity', 12, 3).nullable();
      table.decimal('difference', 12, 3).nullable();
      table.text('notes').nullable();
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('stock_count_items')
    .dropTableIfExists('stock_counts')
    .dropTableIfExists('recipe_items')
    .dropTableIfExists('recipes')
    .dropTableIfExists('purchase_order_items')
    .dropTableIfExists('purchase_orders')
    .dropTableIfExists('inventory_movements')
    .dropTableIfExists('inventory');
};
