/**
 * Seed: Datos iniciales del sistema POS multi-tenant
 * Crea un negocio demo, sucursal, super_admin, admin, cajero, mesero, cocinero
 */
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Limpiar tablas en orden inverso de dependencias
  const tablesToClean = [
    'leave_requests', 'payroll', 'shifts_schedule', 'attendance', 'employees',
    'accounts_payable', 'accounts_receivable', 'journal_entry_lines', 'journal_entries', 'chart_of_accounts',
    'delivery_assignments', 'delivery_zones',
    'price_list_items', 'price_lists', 'coupons', 'discounts',
    'debit_notes', 'credit_notes', 'invoice_sequences',
    'stock_count_items', 'stock_counts', 'recipe_items', 'recipes',
    'purchase_order_items', 'purchase_orders', 'inventory_movements', 'inventory',
    'supplier_products', 'suppliers', 'customers',
    'shift_reports', 'kitchen_tickets', 'settings', 'cash_movements',
    'invoices', 'cash_registers', 'order_items', 'orders',
    'tables_restaurant', 'products', 'categories', 'users',
    'branches', 'businesses'
  ];

  for (const table of tablesToClean) {
    try {
      await knex(table).del();
    } catch (e) {
      // Ignorar si la tabla no existe en algún estado intermedio
    }
  }

  // ============================================================
  // 1. CREAR NEGOCIO PRINCIPAL DEMO
  // ============================================================
  const [business] = await knex('businesses').insert({
    name: 'GastrosPOS Enterprise',
    slug: 'gastrospos-demo',
    nit: '900.123.456-7',
    business_type: 'restaurant',
    plan: 'enterprise',
    max_branches: 10
  }).returning('*');

  console.log(`✅ Negocio creado: ${business.name} (${business.id})`);

  // ============================================================
  // 2. CREAR SUCURSAL PRINCIPAL
  // ============================================================
  const [branch] = await knex('branches').insert({
    business_id: business.id,
    name: 'Sucursal Principal - Medellín',
    code: 'MDE-01',
    address: 'Calle 10 # 43-12, Medellín',
    phone: '(604) 444-5566',
    timezone: 'America/Bogota',
    receipt_footer: '¡Gracias por su compra! Vuelva pronto.'
  }).returning('*');

  console.log(`✅ Sucursal creada: ${branch.name} (${branch.id})`);

  // ============================================================
  // 3. CREAR USUARIOS
  // ============================================================
  const superHash = bcrypt.hashSync('super123', 10);
  const adminHash = bcrypt.hashSync('admin123', 10);
  const demoHash = bcrypt.hashSync('demo123', 10);

  const usersData = [
    {
      business_id: business.id,
      branch_id: null,
      username: 'superadmin',
      password_hash: superHash,
      full_name: 'Super Administrador (Dueño Software)',
      role: 'super_admin'
    },
    {
      business_id: business.id,
      branch_id: null,
      username: 'admin',
      password_hash: adminHash,
      full_name: 'Administrador Principal',
      role: 'admin'
    },
    {
      business_id: business.id,
      branch_id: branch.id,
      username: 'cajero1',
      password_hash: demoHash,
      full_name: 'Carlos Cajero',
      role: 'cajero'
    },
    {
      business_id: business.id,
      branch_id: branch.id,
      username: 'mesero1',
      password_hash: demoHash,
      full_name: 'Mateo Mesero',
      role: 'mesero'
    },
    {
      business_id: business.id,
      branch_id: branch.id,
      username: 'cocinero1',
      password_hash: demoHash,
      full_name: 'Camilo Cocinero',
      role: 'cocinero'
    }
  ];

  const users = await knex('users').insert(usersData).returning('*');
  console.log(`✅ ${users.length} usuarios creados`);

  // ============================================================
  // 4. CREAR CATEGORÍAS
  // ============================================================
  const categoriesData = [
    { business_id: business.id, name: 'Entradas', description: 'Para comenzar', sort_order: 1 },
    { business_id: business.id, name: 'Platos Fuertes', description: 'Platos principales', sort_order: 2 },
    { business_id: business.id, name: 'Bebidas', description: 'Bebidas refrescantes', sort_order: 3 },
    { business_id: business.id, name: 'Postres', description: 'Dulces', sort_order: 4 },
    { business_id: business.id, name: 'Materia Prima', description: 'Ingredientes para cocina', sort_order: 5 }
  ];

  const categories = await knex('categories').insert(categoriesData).returning('*');
  const catMap = {};
  categories.forEach(c => catMap[c.name] = c.id);

  // ============================================================
  // 5. CREAR PRODUCTOS (Con campos ERP)
  // ============================================================
  const productsData = [
    {
      business_id: business.id,
      category_id: catMap['Platos Fuertes'],
      name: 'Bandeja Paisa',
      price: 28000,
      cost_price: 14000,
      sku: 'PL-001',
      barcode: '7701234567890',
      unit_of_measure: 'unidad',
      track_inventory: true,
      min_stock: 10,
      tax_rate: 0.08,
      tax_included: true
    },
    {
      business_id: business.id,
      category_id: catMap['Platos Fuertes'],
      name: 'Ajiaco Santafereño',
      price: 22000,
      cost_price: 10000,
      sku: 'PL-002',
      barcode: '7701234567891',
      unit_of_measure: 'unidad',
      track_inventory: true,
      min_stock: 8,
      tax_rate: 0.08,
      tax_included: true
    },
    {
      business_id: business.id,
      category_id: catMap['Entradas'],
      name: 'Empanadas de Carne (x3)',
      price: 9000,
      cost_price: 3500,
      sku: 'EN-001',
      barcode: '7701234567892',
      unit_of_measure: 'porción',
      track_inventory: true,
      min_stock: 15,
      tax_rate: 0.0,
      tax_included: true
    },
    {
      business_id: business.id,
      category_id: catMap['Bebidas'],
      name: 'Limonada de Coco',
      price: 8000,
      cost_price: 2500,
      sku: 'BE-001',
      barcode: '7701234567893',
      unit_of_measure: 'vaso',
      track_inventory: true,
      min_stock: 20,
      tax_rate: 0.0,
      tax_included: true
    },
    {
      business_id: business.id,
      category_id: catMap['Postres'],
      name: 'Volcán de Chocolate',
      price: 12000,
      cost_price: 4500,
      sku: 'PO-001',
      barcode: '7701234567894',
      unit_of_measure: 'unidad',
      track_inventory: true,
      min_stock: 5,
      tax_rate: 0.19,
      tax_included: true
    }
  ];

  const insertedProducts = await knex('products').insert(productsData).returning('*');

  // ============================================================
  // 6. CREAR INVENTARIO INICIAL
  // ============================================================
  const adminUser = users.find(u => u.username === 'admin');

  for (const prod of insertedProducts) {
    const initQty = prod.min_stock * 3; // 3x stock mínimo
    await knex('inventory').insert({
      business_id: business.id,
      branch_id: branch.id,
      product_id: prod.id,
      quantity: initQty
    });

    await knex('inventory_movements').insert({
      business_id: business.id,
      branch_id: branch.id,
      product_id: prod.id,
      movement_type: 'entrada',
      quantity: initQty,
      unit_cost: prod.cost_price,
      balance_after: initQty,
      reference_type: 'initial_stock',
      notes: 'Inventario inicial de apertura',
      user_id: adminUser.id
    });
  }

  // ============================================================
  // 7. CREAR CLIENTES (CRM)
  // ============================================================
  const [cust1, cust2, cust3] = await knex('customers').insert([
    {
      business_id: business.id,
      document_type: 'CC',
      document_number: '1020304050',
      name: 'Juan Pérez García',
      email: 'juan.perez@example.com',
      phone: '3001234567',
      address: 'Cra 43A # 1-50, El Poblado',
      city: 'Medellín',
      customer_type: 'vip',
      loyalty_points: 150,
      credit_limit: 500000,
      credit_balance: 0
    },
    {
      business_id: business.id,
      document_type: 'NIT',
      document_number: '901234567-1',
      name: 'Inversiones Antioquia S.A.S.',
      email: 'facturacion@inversionesant.com',
      phone: '6043123456',
      address: 'Calle 50 # 50-20 Of. 501',
      city: 'Medellín',
      customer_type: 'mayorista',
      loyalty_points: 50,
      credit_limit: 2000000,
      credit_balance: 0
    },
    {
      business_id: business.id,
      document_type: 'CC',
      document_number: '987654321',
      name: 'María Camila Restrepo',
      email: 'camila.restrepo@example.com',
      phone: '3109876543',
      address: 'Circular 4 # 70-15, Laureles',
      city: 'Medellín',
      customer_type: 'regular',
      loyalty_points: 40,
      credit_limit: 100000,
      credit_balance: 0
    }
  ]).returning('*');

  // ============================================================
  // 8. CREAR PROVEEDORES
  // ============================================================
  const [supplier1] = await knex('suppliers').insert({
    business_id: business.id,
    name: 'Distribuidora Carnes del Valle S.A.S.',
    contact_name: 'Roberto Gómez',
    document_number: '900888777-3',
    email: 'ventas@carnesdelvalle.com',
    phone: '3157778899',
    address: 'Central Mayorista Bloque 12 Local 4',
    city: 'Itagüí',
    payment_terms: '30 días'
  }).returning('*');

  const [supplier2] = await knex('suppliers').insert({
    business_id: business.id,
    name: 'Avícola & Huevos Santa Elena',
    contact_name: 'Elena Cuartas',
    document_number: '901555444-2',
    email: 'pedidos@avicolasantaelena.com',
    phone: '3206665544',
    address: 'Vereda El Placer, Santa Elena',
    city: 'Medellín',
    payment_terms: 'contado'
  }).returning('*');

  // Asociar productos a proveedores
  if (insertedProducts.length > 0) {
    await knex('supplier_products').insert([
      { supplier_id: supplier1.id, product_id: insertedProducts[0].id, supplier_sku: 'CAR-001', cost_price: 13500, lead_time_days: 2 },
      { supplier_id: supplier2.id, product_id: insertedProducts[1].id, supplier_sku: 'AVI-002', cost_price: 9500, lead_time_days: 1 }
    ]);
  }

  // ============================================================
  // 9. CREAR PLAN DE CUENTAS ESTÁNDAR
  // ============================================================
  const defaultAccounts = [
    { code: '1', name: 'ACTIVOS', account_type: 'activo' },
    { code: '1.1', name: 'Activo Corriente', account_type: 'activo', parent_code: '1' },
    { code: '1.1.01', name: 'Caja General', account_type: 'activo', parent_code: '1.1' },
    { code: '1.1.02', name: 'Bancos', account_type: 'activo', parent_code: '1.1' },
    { code: '1.1.03', name: 'Cuentas por Cobrar', account_type: 'activo', parent_code: '1.1' },
    { code: '1.1.04', name: 'Inventario de Mercancías', account_type: 'activo', parent_code: '1.1' },
    { code: '2', name: 'PASIVOS', account_type: 'pasivo' },
    { code: '2.1', name: 'Pasivo Corriente', account_type: 'pasivo', parent_code: '2' },
    { code: '2.1.01', name: 'Cuentas por Pagar Proveedores', account_type: 'pasivo', parent_code: '2.1' },
    { code: '2.1.02', name: 'IVA por Pagar', account_type: 'pasivo', parent_code: '2.1' },
    { code: '2.1.03', name: 'Retenciones por Pagar', account_type: 'pasivo', parent_code: '2.1' },
    { code: '2.1.04', name: 'Nómina por Pagar', account_type: 'pasivo', parent_code: '2.1' },
    { code: '3', name: 'PATRIMONIO', account_type: 'patrimonio' },
    { code: '3.1', name: 'Capital Social', account_type: 'patrimonio', parent_code: '3' },
    { code: '3.2', name: 'Utilidades del Ejercicio', account_type: 'patrimonio', parent_code: '3' },
    { code: '4', name: 'INGRESOS', account_type: 'ingreso' },
    { code: '4.1', name: 'Ingresos Operacionales', account_type: 'ingreso', parent_code: '4' },
    { code: '4.1.01', name: 'Ventas de Productos', account_type: 'ingreso', parent_code: '4.1' },
    { code: '4.1.02', name: 'Ingresos por Propinas', account_type: 'ingreso', parent_code: '4.1' },
    { code: '4.1.03', name: 'Ingresos por Delivery', account_type: 'ingreso', parent_code: '4.1' },
    { code: '5', name: 'GASTOS', account_type: 'gasto' },
    { code: '5.1', name: 'Gastos Operacionales', account_type: 'gasto', parent_code: '5' },
    { code: '5.1.01', name: 'Costo de Ventas', account_type: 'gasto', parent_code: '5.1' },
    { code: '5.1.02', name: 'Gastos de Personal / Nómina', account_type: 'gasto', parent_code: '5.1' },
    { code: '5.1.03', name: 'Servicios Públicos', account_type: 'gasto', parent_code: '5.1' },
    { code: '5.1.04', name: 'Arriendo', account_type: 'gasto', parent_code: '5.1' }
  ];

  const accountMap = {};
  for (const acc of defaultAccounts) {
    const [created] = await knex('chart_of_accounts').insert({
      business_id: business.id, code: acc.code, name: acc.name, account_type: acc.account_type
    }).returning('*');
    accountMap[acc.code] = created.id;
  }

  for (const acc of defaultAccounts) {
    if (acc.parent_code && accountMap[acc.parent_code]) {
      await knex('chart_of_accounts')
        .where({ id: accountMap[acc.code] })
        .update({ parent_id: accountMap[acc.parent_code] });
    }
  }

  // ============================================================
  // 10. CREAR EMPLEADOS (RRHH)
  // ============================================================
  const cajeroUser = users.find(u => u.username === 'cajero1');
  const meseroUser = users.find(u => u.username === 'mesero1');
  const cocineroUser = users.find(u => u.username === 'cocinero1');

  await knex('employees').insert([
    {
      business_id: business.id,
      branch_id: branch.id,
      user_id: cajeroUser?.id || null,
      first_name: 'Carlos',
      last_name: 'Cajero',
      document_type: 'CC',
      document_number: '1037654321',
      phone: '3012223344',
      email: 'carlos.caja@restaurante.com',
      position: 'Cajero Principal',
      base_salary: 1600000,
      commission_rate: 0.01,
      contract_type: 'indefinido',
      hire_date: '2024-01-15'
    },
    {
      business_id: business.id,
      branch_id: branch.id,
      user_id: meseroUser?.id || null,
      first_name: 'Mateo',
      last_name: 'Mesero',
      document_type: 'CC',
      document_number: '1048765432',
      phone: '3124445566',
      email: 'mateo.servicio@restaurante.com',
      position: 'Capitán de Meseros',
      base_salary: 1450000,
      commission_rate: 0.02,
      contract_type: 'indefinido',
      hire_date: '2024-02-01'
    },
    {
      business_id: business.id,
      branch_id: branch.id,
      user_id: cocineroUser?.id || null,
      first_name: 'Camilo',
      last_name: 'Cocinero',
      document_type: 'CC',
      document_number: '1059876543',
      phone: '3189998877',
      email: 'camilo.chef@restaurante.com',
      position: 'Chef Ejecutivo',
      base_salary: 2200000,
      commission_rate: 0.0,
      contract_type: 'indefinido',
      hire_date: '2023-11-01'
    }
  ]);

  // ============================================================
  // 11. CREAR ZONAS DE DELIVERY Y DESCUENTOS
  // ============================================================
  const [zone1, zone2, zone3] = await knex('delivery_zones').insert([
    { business_id: business.id, name: 'Poblado / Provenza', delivery_fee: 5000, estimated_time_mins: 25 },
    { business_id: business.id, name: 'Laureles / Estadio', delivery_fee: 7000, estimated_time_mins: 35 },
    { business_id: business.id, name: 'Envigado / Sabaneta', delivery_fee: 9000, estimated_time_mins: 45 }
  ]).returning('*');

  // Crear 2 Órdenes Demo de Delivery
  const [delOrder1] = await knex('orders').insert({
    business_id: business.id,
    branch_id: branch.id,
    user_id: adminUser.id,
    order_type: 'delivery',
    customer_id: cust1.id,
    delivery_address: 'Calle 10 # 43E-12, Apto 502, El Poblado',
    delivery_phone: '3001234567',
    delivery_notes: 'Timbre 502, no tiene portería',
    status: 'abierta'
  }).returning('*');

  await knex('order_items').insert([
    { order_id: delOrder1.id, product_id: insertedProducts[0].id, quantity: 2, unit_price: 32000, notes: 'Término medio' },
    { order_id: delOrder1.id, product_id: insertedProducts[3]?.id || insertedProducts[0].id, quantity: 2, unit_price: 8000, notes: 'Bien fría' }
  ]);

  await knex('delivery_assignments').insert({
    order_id: delOrder1.id,
    driver_user_id: meseroUser?.id || adminUser.id,
    delivery_zone_id: zone1.id,
    status: 'en_camino',
    notes: 'Despachado a tiempo'
  });

  const [delOrder2] = await knex('orders').insert({
    business_id: business.id,
    branch_id: branch.id,
    user_id: adminUser.id,
    order_type: 'delivery',
    customer_id: cust2.id,
    delivery_address: 'Circular 4 # 73-20, Casa 2, Laureles',
    delivery_phone: '3109876543',
    delivery_notes: 'Pagar con billete de $50.000',
    status: 'abierta'
  }).returning('*');

  await knex('order_items').insert([
    { order_id: delOrder2.id, product_id: insertedProducts[1]?.id || insertedProducts[0].id, quantity: 1, unit_price: 35000, notes: 'Sin cebolla' },
    { order_id: delOrder2.id, product_id: insertedProducts[4]?.id || insertedProducts[0].id, quantity: 1, unit_price: 12000, notes: 'Cubiertos desechables' }
  ]);

  await knex('delivery_assignments').insert({
    order_id: delOrder2.id,
    driver_user_id: cajeroUser?.id || adminUser.id,
    delivery_zone_id: zone2.id,
    status: 'asignado',
    notes: 'Listo en empaque térmico'
  });

  const [promo] = await knex('discounts').insert({
    business_id: business.id,
    branch_id: branch.id,
    name: 'Descuento Happy Hour 15%',
    description: '15% de descuento en bebidas de 4pm a 7pm',
    discount_type: 'percentage',
    value: 15,
    applies_to: 'category',
    target_id: catMap['Bebidas'],
    start_time: '16:00:00',
    end_time: '19:00:00',
    days_of_week: JSON.stringify([1, 2, 3, 4, 5])
  }).returning('*');

  await knex('coupons').insert({
    business_id: business.id,
    code: 'BIENVENIDO2026',
    discount_id: promo.id,
    max_uses: 100,
    valid_from: '2026-01-01',
    valid_until: '2026-12-31'
  });

  // ============================================================
  // 12. CREAR MESAS
  // ============================================================
  const tablesData = [];
  for (let i = 1; i <= 8; i++) {
    tablesData.push({
      business_id: business.id,
      branch_id: branch.id,
      table_number: `Mesa ${i}`,
      capacity: 4,
      zone: i <= 6 ? 'interior' : 'exterior'
    });
  }
  await knex('tables_restaurant').insert(tablesData);

  // ============================================================
  // 13. CONFIGURACIÓN
  // ============================================================
  await knex('settings').insert({
    business_id: business.id,
    branch_id: null,
    business_name: business.name,
    nit: business.nit,
    address: branch.address,
    phone: branch.phone,
    receipt_footer: branch.receipt_footer,
    default_paper_width: '80mm'
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  SEED MULTI-TENANT & ERP COMPLETADO');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Super Admin: superadmin / super123 (Dueño Software)`);
  console.log(`  Admin Negocio: admin / admin123`);
  console.log(`  Cajero: cajero1 / demo123`);
  console.log(`  Mesero: mesero1 / demo123`);
  console.log(`  Cocinero: cocinero1 / demo123`);
  console.log('═══════════════════════════════════════════════');
};
