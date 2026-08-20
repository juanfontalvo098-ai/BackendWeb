/**
 * Migration 021: Crear módulo completo de Insumos / Materias Primas y actualizar Recetas
 * - supplies: Catálogo de insumos e ingredientes
 * - supplies_inventory: Stock de insumos por sucursal
 * - supplies_movements: Kardex de movimientos de insumos
 * - actualiza recipe_items para enlazar a supplies(supply_id)
 * - actualiza purchase_order_items y stock_count_items para soportar supply_id
 */
exports.up = async function(knex) {
  await knex.schema
    // 1. Tabla de Insumos
    .createTable('supplies', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('sku', 100).nullable();
      table.string('barcode', 100).nullable();
      table.string('category', 100).defaultTo('General'); // Carnes, Lácteos, Verduras, Abarrotes, Empaques, Licores/Bebidas, etc.
      table.string('unit_of_measure', 30).defaultTo('kg'); // kg, g, lt, ml, unidad, oz, lb, paquete, porcion
      table.decimal('cost_price', 12, 2).defaultTo(0);
      table.decimal('min_stock', 12, 3).defaultTo(5);
      table.decimal('ideal_stock', 12, 3).defaultTo(20);
      table.integer('supplier_id').nullable().references('id').inTable('suppliers').onDelete('SET NULL');
      table.text('description').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id'], 'idx_supplies_business');
    })

    // 2. Inventario de Insumos por Sucursal
    .createTable('supplies_inventory', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('supply_id').notNullable().references('id').inTable('supplies').onDelete('CASCADE');
      table.decimal('quantity', 12, 3).defaultTo(0);
      table.decimal('reserved_quantity', 12, 3).defaultTo(0);
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['branch_id', 'supply_id']);
      table.index(['business_id', 'branch_id'], 'idx_supplies_inv_tenant');
    })

    // 3. Kardex / Movimientos de Insumos
    .createTable('supplies_movements', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('supply_id').notNullable().references('id').inTable('supplies').onDelete('CASCADE');
      table.string('movement_type', 40).notNullable(); // entrada_compra, salida_receta_venta, ajuste, merma, transferencia_in, transferencia_out, conteo_fisico
      table.decimal('quantity', 12, 3).notNullable();
      table.decimal('unit_cost', 12, 2).nullable();
      table.decimal('balance_after', 12, 3).notNullable();
      table.string('reference_type', 50).nullable(); // purchase_order, invoice, adjustment, stock_count
      table.integer('reference_id').nullable();
      table.text('notes').nullable();
      table.integer('user_id').nullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'branch_id', 'supply_id'], 'idx_supplies_movements_supply');
    });

  // 4. Agregar supply_id a recipe_items (haciendo ingredient_id nullable)
  await knex.schema.alterTable('recipe_items', (table) => {
    table.integer('supply_id').nullable().references('id').inTable('supplies').onDelete('CASCADE');
    table.decimal('cost', 12, 2).defaultTo(0);
  });

  // 5. Agregar supply_id a purchase_order_items y stock_count_items
  await knex.schema.alterTable('purchase_order_items', (table) => {
    table.integer('supply_id').nullable().references('id').inTable('supplies').onDelete('CASCADE');
  });

  await knex.schema.alterTable('stock_count_items', (table) => {
    table.integer('supply_id').nullable().references('id').inTable('supplies').onDelete('CASCADE');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('stock_count_items', (table) => {
    table.dropColumn('supply_id');
  });
  await knex.schema.alterTable('purchase_order_items', (table) => {
    table.dropColumn('supply_id');
  });
  await knex.schema.alterTable('recipe_items', (table) => {
    table.dropColumn('cost');
    table.dropColumn('supply_id');
  });
  await knex.schema.dropTableIfExists('supplies_movements');
  await knex.schema.dropTableIfExists('supplies_inventory');
  await knex.schema.dropTableIfExists('supplies');
};
