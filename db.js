const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'campuscart.db');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Try to add category column for existing databases (ignore error if it already exists)
  db.run('ALTER TABLE products ADD COLUMN category TEXT', (alterErr) => {
    if (alterErr && !String(alterErr.message).includes('duplicate column')) {
      console.warn('Could not alter products table to add category column:', alterErr.message);
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Seed sample products if table is empty
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (err) {
      console.error('Error checking products count', err);
      return;
    }
    if (row.count === 0) {
      const stmt = db.prepare(
        'INSERT INTO products (name, description, price, image_url, category) VALUES (?, ?, ?, ?, ?)'
      );
      const sampleProducts = [
        [
          'Campus Hoodie',
          'Cozy unisex hoodie with campus logo. Perfect for chilly lecture halls and late-night library sessions.',
          1299.0,
          'images/hoodie.svg',
          'Apparel',
        ],
        [
          'Notebook Pack (Set of 5)',
          'Minimal, high-quality notebooks designed for heavy note‑takers and exam prep.',
          299.0,
          'images/notebooks.svg',
          'Stationery',
        ],
        [
          'Campus Mug',
          'Sturdy ceramic mug to keep you fuelled through projects, labs, and all‑nighters.',
          449.0,
          'images/mug.svg',
          'Merchandise',
        ],
        [
          'Laptop Sleeve',
          'Slim, padded sleeve that fits most 13–14 inch laptops and keeps them safe in your backpack.',
          999.0,
          'https://images.pexels.com/photos/196654/pexels-photo-196654.jpeg?auto=compress&cs=tinysrgb&w=800',
          'Electronics',
        ],
        [
          'Wireless Earbuds',
          'Compact wireless earbuds with noise isolation — great for lectures, workouts and commutes.',
          1899.0,
          'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=800',
          'Electronics',
        ],
      ];
      sampleProducts.forEach((p) => stmt.run(p));
      stmt.finalize();
      console.log('Seeded sample products into database.');
    }
  });
});

module.exports = db;


