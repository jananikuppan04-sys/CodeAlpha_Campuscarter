const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'campuscart_dev_secret';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper: generate JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing auth token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Routes - Products
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to fetch products' });
    }
    res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to fetch product' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(row);
  });
});

// Routes - Auth
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
  );
  stmt.run([name, email, passwordHash], function (err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ message: 'Email already registered' });
      }
      console.error(err);
      return res.status(500).json({ message: 'Failed to register user' });
    }
    const user = { id: this.lastID, name, email };
    const token = generateToken(user);
    res.status(201).json({ user, token });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to login' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  });
});

// Routes - Orders (protected)
app.post('/api/orders', authMiddleware, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Order items are required' });
  }

  const productIds = items.map((i) => i.productId);
  const placeholders = productIds.map(() => '?').join(',');

  db.all(
    `SELECT * FROM products WHERE id IN (${placeholders})`,
    productIds,
    (err, products) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to process order' });
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      let totalAmount = 0;

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Invalid product in cart: ${item.productId}` });
        }
        const price = product.price;
        totalAmount += price * item.quantity;
      }

      db.run(
        'INSERT INTO orders (user_id, total_amount) VALUES (?, ?)',
        [req.user.id, totalAmount],
        function (orderErr) {
          if (orderErr) {
            console.error(orderErr);
            return res.status(500).json({ message: 'Failed to create order' });
          }

          const orderId = this.lastID;
          const stmt = db.prepare(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
          );

          items.forEach((item) => {
            const product = productMap.get(item.productId);
            stmt.run([orderId, item.productId, item.quantity, product.price]);
          });

          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              console.error(finalizeErr);
              return res.status(500).json({ message: 'Failed to finalize order' });
            }

            res.status(201).json({
              message: 'Order placed successfully',
              orderId,
              totalAmount,
            });
          });
        }
      );
    }
  );
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'CampusCart' });
});

app.listen(PORT, () => {
  console.log(`CampusCart server running on http://localhost:${PORT}`);
});


