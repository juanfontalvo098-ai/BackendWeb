/**
 * Migration 030: Actualizar llaves foráneas a ON DELETE CASCADE / SET NULL
 * Para evitar errores de integridad referencial al eliminar negocios o sucursales
 */
exports.up = async function(knex) {
  // Helper para recrear FK con CASCADE o SET NULL si la tabla existe
  const fixFk = async (table, constraint, col, refTable, refCol, onDelete = 'CASCADE') => {
    try {
      await knex.raw(`
        ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";
      `);
      await knex.raw(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" 
        FOREIGN KEY ("${col}") REFERENCES "${refTable}"("${refCol}") ON DELETE ${onDelete};
      `);
    } catch (e) {
      console.log(`Note on FK ${table}.${col}:`, e.message);
    }
  };

  await fixFk('delivery_assignments', 'delivery_assignments_driver_user_id_foreign', 'driver_user_id', 'users', 'id', 'CASCADE');
  await fixFk('delivery_assignments', 'delivery_assignments_delivery_zone_id_foreign', 'delivery_zone_id', 'delivery_zones', 'id', 'SET NULL');
  await fixFk('invoices', 'invoices_order_id_foreign', 'order_id', 'orders', 'id', 'CASCADE');
  await fixFk('invoices', 'invoices_cash_register_id_foreign', 'cash_register_id', 'cash_registers', 'id', 'SET NULL');
  await fixFk('invoices', 'invoices_user_id_foreign', 'user_id', 'users', 'id', 'CASCADE');
  await fixFk('kitchen_tickets', 'kitchen_tickets_order_id_foreign', 'order_id', 'orders', 'id', 'CASCADE');
  await fixFk('orders', 'orders_table_id_foreign', 'table_id', 'tables_restaurant', 'id', 'SET NULL');
  await fixFk('orders', 'orders_user_id_foreign', 'user_id', 'users', 'id', 'CASCADE');
  await fixFk('cash_registers', 'cash_registers_user_id_foreign', 'user_id', 'users', 'id', 'CASCADE');
  await fixFk('shift_reports', 'shift_reports_cash_register_id_foreign', 'cash_register_id', 'cash_registers', 'id', 'CASCADE');
  await fixFk('shift_reports', 'shift_reports_user_id_foreign', 'user_id', 'users', 'id', 'CASCADE');
  await fixFk('products', 'products_category_id_foreign', 'category_id', 'categories', 'id', 'SET NULL');
  await fixFk('order_items', 'order_items_product_id_foreign', 'product_id', 'products', 'id', 'CASCADE');
  await fixFk('recipe_items', 'recipe_items_ingredient_id_foreign', 'ingredient_id', 'products', 'id', 'SET NULL');
  await fixFk('purchase_order_items', 'purchase_order_items_product_id_foreign', 'product_id', 'products', 'id', 'CASCADE');
  await fixFk('stock_count_items', 'stock_count_items_product_id_foreign', 'product_id', 'products', 'id', 'CASCADE');
  await fixFk('journal_entry_lines', 'journal_entry_lines_account_id_foreign', 'account_id', 'chart_of_accounts', 'id', 'CASCADE');
  await fixFk('accounts_receivable', 'accounts_receivable_customer_id_foreign', 'customer_id', 'customers', 'id', 'CASCADE');
  await fixFk('accounts_payable', 'accounts_payable_supplier_id_foreign', 'supplier_id', 'suppliers', 'id', 'CASCADE');
  await fixFk('purchase_orders', 'purchase_orders_supplier_id_foreign', 'supplier_id', 'suppliers', 'id', 'CASCADE');
};

exports.down = function(knex) {
  return Promise.resolve();
};
