const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "database", "girafa.db");
const DB_KEY = String(process.env.DB_KEY || "").trim();
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const ADMIN_SEED_USERNAME = String(process.env.ADMIN_SEED_USERNAME || "admin@girafa.com").trim().toLowerCase();
const ADMIN_SEED_PASSWORD = String(process.env.ADMIN_SEED_PASSWORD || "").trim();

function resolveSqliteDriver() {
  try {
    // SQLCipher drop-in compatible com sqlite3 para Node.
    return {
      driver: require("@journeyapps/sqlcipher").verbose(),
      isSqlcipher: true
    };
  } catch (_error) {
    return {
      driver: require("sqlite3").verbose(),
      isSqlcipher: false
    };
  }
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

const { driver: sqlite3, isSqlcipher } = resolveSqliteDriver();

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });
}

async function initializeDatabase() {
  if (DB_KEY) {
    if (!isSqlcipher) {
      throw new Error(
        "DB_KEY definida, mas SQLCipher nao esta instalado. Instale: npm i @journeyapps/sqlcipher"
      );
    }

    await run(`PRAGMA key = '${escapeSqlLiteral(DB_KEY)}'`);
    await run("PRAGMA cipher_compatibility = 4");
  }

  // Schema principal da loja e do painel admin.
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL,
      category_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      notes TEXT,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_whatsapp',
      production_status TEXT NOT NULL DEFAULT 'pendente',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'pix',
      type TEXT NOT NULL DEFAULT 'parcial',
      note TEXT,
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inventory_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_name TEXT,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const orderColumns = await all("PRAGMA table_info(orders)");
  const orderColumnNames = orderColumns.map((item) => item.name);
  if (!orderColumnNames.includes("customer_id")) {
    await run("ALTER TABLE orders ADD COLUMN customer_id INTEGER");
  }
  if (!orderColumnNames.includes("customer_email")) {
    await run("ALTER TABLE orders ADD COLUMN customer_email TEXT");
  }
  if (!orderColumnNames.includes("updated_at")) {
    await run("ALTER TABLE orders ADD COLUMN updated_at DATETIME");
    await run("UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL");
  }
  if (!orderColumnNames.includes("channel")) {
    await run("ALTER TABLE orders ADD COLUMN channel TEXT");
    await run("UPDATE orders SET channel = 'whatsapp' WHERE channel IS NULL OR TRIM(channel) = ''");
  }
  if (!orderColumnNames.includes("notes")) {
    await run("ALTER TABLE orders ADD COLUMN notes TEXT");
  }
  if (!orderColumnNames.includes("production_status")) {
    await run("ALTER TABLE orders ADD COLUMN production_status TEXT");
    await run(`
      UPDATE orders
      SET production_status = CASE
        WHEN status = 'in_production' THEN 'em_producao'
        WHEN status = 'pending_delivery' THEN 'pronto_entrega'
        WHEN status = 'delivered' THEN 'entregue'
        WHEN status IN ('abandoned', 'cancelled', 'launch_error', 'refunded') THEN 'cancelado'
        ELSE 'pendente'
      END
      WHERE production_status IS NULL OR TRIM(production_status) = ''
    `);
  }
  await run(`
    UPDATE orders
    SET production_status = CASE
      WHEN status = 'in_production' THEN 'em_producao'
      WHEN status = 'pending_delivery' THEN 'pronto_entrega'
      WHEN status = 'delivered' THEN 'entregue'
      WHEN status IN ('abandoned', 'cancelled', 'launch_error', 'refunded') THEN 'cancelado'
      ELSE 'pendente'
    END
    WHERE production_status IS NULL OR TRIM(production_status) = ''
  `);
  if (!orderColumnNames.includes("payment_status")) {
    await run("ALTER TABLE orders ADD COLUMN payment_status TEXT");
    await run(`
      UPDATE orders
      SET payment_status = CASE
        WHEN status IN ('paid_confirmed', 'delivered') THEN 'paid'
        WHEN status = 'refunded' THEN 'refunded'
        ELSE 'pending'
      END
      WHERE payment_status IS NULL OR TRIM(payment_status) = ''
    `);
  }
  await run(`
    UPDATE orders
    SET payment_status = CASE
      WHEN status = 'refunded' THEN 'refunded'
      WHEN status = 'paid_confirmed' THEN 'paid'
      ELSE COALESCE(NULLIF(payment_status, ''), 'pending')
    END
    WHERE payment_status IS NULL OR TRIM(payment_status) = ''
  `);

  const productColumns = await all("PRAGMA table_info(products)");
  const productColumnNames = productColumns.map((item) => item.name);
  if (!productColumnNames.includes("cost_price")) {
    await run("ALTER TABLE products ADD COLUMN cost_price REAL");
    await run("UPDATE products SET cost_price = 0 WHERE cost_price IS NULL");
  }

  const orderItemColumns = await all("PRAGMA table_info(order_items)");
  const orderItemColumnNames = orderItemColumns.map((item) => item.name);
  if (!orderItemColumnNames.includes("unit_cost")) {
    await run("ALTER TABLE order_items ADD COLUMN unit_cost REAL");
    await run(`
      UPDATE order_items
      SET unit_cost = COALESCE(
        (SELECT p.cost_price FROM products p WHERE p.id = order_items.product_id),
        0
      )
      WHERE unit_cost IS NULL
    `);
  }

  const categoryCount = await get("SELECT COUNT(*) AS total FROM categories");
  if (categoryCount.total === 0) {
    await seedInitialData();
  }
}

async function seedInitialData() {
  // Dados base para o projeto rodar "pronto para uso" no primeiro start.
  const categories = ["Impressoras", "Prensas", "Tintas", "Acessorios"];
  for (const name of categories) {
    await run("INSERT INTO categories (name) VALUES (?)", [name]);
  }

  const catRows = await all("SELECT id, name FROM categories");
  const categoryMap = Object.fromEntries(catRows.map((item) => [item.name, item.id]));

  const products = [
    {
      name: "Impressora Sublimatica Pro 400",
      description: "Alta definicao para personalizacoes em escala profissional.",
      price: 1899.9,
      image_url: "/assets/images/impressora.svg",
      category: "Impressoras"
    },
    {
      name: "Prensa Termica Girafa 38x38",
      description: "Pressao uniforme e controle digital de temperatura.",
      price: 1450,
      image_url: "/assets/images/prensa.svg",
      category: "Prensas"
    },
    {
      name: "Kit Tintas Sublimaticas CMYK",
      description: "Cores vibrantes e secagem rapida para impressao continua.",
      price: 249.9,
      image_url: "/assets/images/tinta.svg",
      category: "Tintas"
    },
    {
      name: "Papel Sublimatico Premium A4",
      description: "Pacote com 100 folhas de alta transferencia.",
      price: 79.9,
      image_url: "/assets/images/papel.svg",
      category: "Acessorios"
    }
  ];

  for (const product of products) {
    await run(
      `INSERT INTO products (name, description, price, image_url, category_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        product.name,
        product.description,
        product.price,
        product.image_url,
        categoryMap[product.category]
      ]
    );
  }

  const existingAdmin = await get("SELECT id FROM admin_users WHERE username = ?", [
    ADMIN_SEED_USERNAME
  ]);

  if (!existingAdmin) {
    const passwordToUse =
      ADMIN_SEED_PASSWORD || (NODE_ENV === "production" ? "" : "123456");

    if (!passwordToUse) {
      throw new Error(
        "ADMIN_SEED_PASSWORD obrigatoria para criar usuario admin inicial em producao."
      );
    }

    const hash = await bcrypt.hash(passwordToUse, 10);
    await run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", [
      ADMIN_SEED_USERNAME,
      hash
    ]);
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase
};
