/**
 * Seed: Datos iniciales del sistema POS multi-tenant
 * Crea un negocio demo, sucursal, super_admin, admin, cajero, mesero, cocinero
 */
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Limpiar tablas en orden inverso de dependencias
  await knex('shift_reports').del();
  await knex('kitchen_tickets').del();
  await knex('settings').del();
  await knex('cash_movements').del();
  await knex('invoices').del();
  await knex('cash_registers').del();
  await knex('order_items').del();
  await knex('orders').del();
  await knex('tables_restaurant').del();
  await knex('products').del();
  await knex('categories').del();
  await knex('users').del();
  await knex('branches').del();
  await knex('businesses').del();

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
  // 3. CREAR USUARIOS (Incluyendo Super Admin Global)
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
    { business_id: business.id, name: 'Postres', description: 'Dulces', sort_order: 4 }
  ];

  const categories = await knex('categories').insert(categoriesData).returning('*');
  const catMap = {};
  categories.forEach(c => catMap[c.name] = c.id);

  // ============================================================
  // 5. CREAR PRODUCTOS
  // ============================================================
  const productsData = [
    { business_id: business.id, category_id: catMap['Platos Fuertes'], name: 'Bandeja Paisa', price: 28000, tax_rate: 0.08, tax_included: true },
    { business_id: business.id, category_id: catMap['Platos Fuertes'], name: 'Ajiaco Santafereño', price: 22000, tax_rate: 0.08, tax_included: true },
    { business_id: business.id, category_id: catMap['Entradas'], name: 'Empanadas de Carne (x3)', price: 9000, tax_rate: 0.0, tax_included: true },
    { business_id: business.id, category_id: catMap['Bebidas'], name: 'Limonada de Coco', price: 8000, tax_rate: 0.0, tax_included: true },
    { business_id: business.id, category_id: catMap['Postres'], name: 'Volcán de Chocolate', price: 12000, tax_rate: 0.19, tax_included: true }
  ];

  await knex('products').insert(productsData);

  // ============================================================
  // 6. CREAR MESAS
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
  // 7. CREAR CONFIGURACIÓN DEL NEGOCIO
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
  console.log('  SEED MULTI-TENANT COMPLETADO');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Super Admin: superadmin / super123 (Dueño Software)`);
  console.log(`  Admin Negocio: admin / admin123`);
  console.log(`  Cajero: cajero1 / demo123`);
  console.log(`  Mesero: mesero1 / demo123`);
  console.log(`  Cocinero: cocinero1 / demo123`);
  console.log('═══════════════════════════════════════════════');
};
