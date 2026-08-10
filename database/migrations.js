const db = require('./connection');
const bcrypt = require('bcryptjs');

async function runMigrations() {
  await db.initialize();
  console.log('Conexión a base de datos establecida.');
  console.log('Iniciando migraciones...');

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','cajero','mesero','cocinero')),
      is_active INTEGER DEFAULT 1,
      permissions TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      tax_rate REAL DEFAULT 0.0,
      tax_included INTEGER DEFAULT 1,
      is_available INTEGER DEFAULT 1,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS tables_restaurant (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT UNIQUE NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'libre' CHECK(status IN ('libre','ocupada','pendiente_pago')),
      zone TEXT DEFAULT 'interior' CHECK(zone IN ('interior','exterior','barra'))
    )`,
    `CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      opening_amount REAL NOT NULL,
      closing_amount REAL,
      expected_amount REAL,
      difference REAL,
      status TEXT DEFAULT 'abierta' CHECK(status IN ('abierta','cerrada')),
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_register_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ingreso','egreso','retiro','venta')),
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'efectivo' CHECK(payment_method IN ('efectivo','tarjeta','transferencia')),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'abierta' CHECK(status IN ('abierta','en_preparacion','lista','cerrada','cancelada')),
      guests INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES tables_restaurant(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 0.0,
      tax_included INTEGER DEFAULT 1,
      notes TEXT,
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','enviado_cocina','preparando','listo','entregado')),
      sent_to_kitchen_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      cash_register_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      tax_total REAL NOT NULL,
      tip_percentage REAL DEFAULT 0,
      tip_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('efectivo','tarjeta','transferencia','mixto')),
      invoice_number TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS kitchen_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      table_number TEXT NOT NULL,
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','preparando','listo')),
      items_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      business_name TEXT DEFAULT 'GastrosPOS Enterprise',
      nit TEXT DEFAULT '900.123.456-7',
      address TEXT DEFAULT 'Calle 10 # 43-12, Medellín',
      phone TEXT DEFAULT '(604) 444-5566',
      receipt_footer TEXT DEFAULT '¡Gracias por su preferencia!',
      logo_url TEXT DEFAULT '',
      default_paper_width TEXT DEFAULT '80mm'
    )`,
    `CREATE TABLE IF NOT EXISTS shift_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_register_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      shift_name TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      opening_amount REAL NOT NULL,
      closing_amount REAL NOT NULL,
      expected_amount REAL NOT NULL,
      difference REAL NOT NULL,
      gross_revenue REAL NOT NULL,
      net_revenue REAL NOT NULL,
      tax_total REAL NOT NULL,
      total_tips REAL NOT NULL,
      total_tickets INTEGER NOT NULL,
      cash_sales REAL NOT NULL,
      card_sales REAL NOT NULL,
      transfer_sales REAL NOT NULL,
      total_withdrawals REAL NOT NULL,
      total_voids REAL NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  ];

  for (const sql of tables) {
    db.prepare(sql).run();
  }

  try {
    db.prepare("ALTER TABLE users ADD COLUMN permissions TEXT").run();
  } catch (e) {}

  console.log('Migraciones completadas.');
  seedData();
}

function seedData() {
  const usersCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (usersCount === 0) {
    console.log('Insertando datos de prueba...');
    const adminHash = bcrypt.hashSync('admin123', 10);
    const demoHash = bcrypt.hashSync('demo123', 10);
    
    db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)").run('admin', adminHash, 'Administrador Principal', 'admin');
    db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)").run('cajero1', demoHash, 'Carlos Cajero', 'cajero');
    db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)").run('mesero1', demoHash, 'Mateo Mesero', 'mesero');
    db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)").run('cocinero1', demoHash, 'Camilo Cocinero', 'cocinero');

    db.prepare("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)").run('Entradas', 'Para comenzar', 1);
    const catEntradas = db.prepare("SELECT last_insert_rowid() as id").get().id;
    
    db.prepare("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)").run('Platos Fuertes', 'Platos principales', 2);
    const catPlatosFuertes = db.prepare("SELECT last_insert_rowid() as id").get().id;
    
    db.prepare("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)").run('Bebidas', 'Bebidas refrescantes', 3);
    const catBebidas = db.prepare("SELECT last_insert_rowid() as id").get().id;
    
    db.prepare("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)").run('Postres', 'Dulces', 4);
    const catPostres = db.prepare("SELECT last_insert_rowid() as id").get().id;

    db.prepare("INSERT INTO products (category_id, name, price, tax_rate, tax_included) VALUES (?, ?, ?, ?, ?)").run(catPlatosFuertes, 'Bandeja Paisa', 28000, 0.08, 1);
    db.prepare("INSERT INTO products (category_id, name, price, tax_rate, tax_included) VALUES (?, ?, ?, ?, ?)").run(catPlatosFuertes, 'Ajiaco Santafereño', 22000, 0.08, 1);
    db.prepare("INSERT INTO products (category_id, name, price, tax_rate, tax_included) VALUES (?, ?, ?, ?, ?)").run(catEntradas, 'Empanadas de Carne (x3)', 9000, 0.0, 1);
    db.prepare("INSERT INTO products (category_id, name, price, tax_rate, tax_included) VALUES (?, ?, ?, ?, ?)").run(catBebidas, 'Limonada de Coco', 8000, 0.0, 1);
    db.prepare("INSERT INTO products (category_id, name, price, tax_rate, tax_included) VALUES (?, ?, ?, ?, ?)").run(catPostres, 'Volcán de Chocolate', 12000, 0.19, 1);

    for (let i = 1; i <= 8; i++) {
      db.prepare("INSERT INTO tables_restaurant (table_number, capacity, zone) VALUES (?, ?, ?)").run(`Mesa ${i}`, 4, 'interior');
    }
  }

  const settingsCount = db.prepare("SELECT COUNT(*) AS count FROM settings").get().count;
  if (settingsCount === 0) {
    db.prepare("INSERT INTO settings (id, business_name, nit, address, phone, receipt_footer) VALUES (1, 'GastrosPOS Enterprise', '900.123.456-7', 'Calle 10 # 43-12, Medellín', '(604) 444-5566', '¡Gracias por su compra! Vuelva pronto.')").run();
  }

  db._saveToDisk();
}

module.exports = { runMigrations };
