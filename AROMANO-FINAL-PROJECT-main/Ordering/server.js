// ============================================
// Aromano Co. Ordering System - Backend Server
// File: server.js
// Run: node server.js
// ============================================
const express = require('express');
const mysql = require('mysql2');

const app = express();

app.get('/test', (req, res) => {
    res.send('Server working');
});
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Wishlist = require('./models/Wishlist');
const Review = require('./models/Review');
const Notification = require('./models/Notification');
const OrderTracking = require('./models/OrderTracking');

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aromano_secret_key';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aromano_auth';

// Middleware
app.use(cors());
app.use(express.json());
app.get('/order-tracking', (req, res) => res.redirect('/order-tracking.html'));
app.get('/order-tracking/', (req, res) => res.redirect('/order-tracking.html'));
app.get('/__routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach(mw => {
        if (mw.route) {
            const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
            routes.push({ path: mw.route.path, methods });
        }
    });
    res.json(routes);
});

// ============================================
// MySQL Connection
// ============================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',          // Change if you have a MySQL password
    database: 'aromano_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to MySQL database: aromano_db');
});

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB for auth'))
    .catch((err) => console.error('MongoDB connection failed:', err.message));

function generateToken(user) {
    return jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ error: 'Authentication token missing' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = payload;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

async function createNotificationFromRequest(req, type, message, relatedId) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await Notification.create({
            user: decoded.userId,
            type,
            message,
            relatedId,
        });
    } catch (err) {
        // ignore invalid token or notification errors
    }
}

// ============================================
// API ROUTES: AUTH
// ============================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { first_name, last_name, email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            first_name: first_name || '',
            last_name: last_name || '',
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: email.toLowerCase().trim().startsWith('admin') ? 'admin' : 'customer',
        });
        const token = generateToken(user);
        res.status(201).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name,
            },
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Could not register user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const matched = await bcrypt.compare(password, user.password);
        if (!matched) return res.status(401).json({ error: 'Invalid credentials' });
        const token = generateToken(user);
        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Could not log in' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error('Auth me error:', err);
        res.status(500).json({ error: 'Could not verify user' });
    }
});

// ============================================
// API ROUTES: WISHLIST
// ============================================
app.get('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.userId });
        res.json({ items: wishlist ? wishlist.items : [] });
    } catch (err) {
        console.error('Wishlist get error:', err);
        res.status(500).json({ error: 'Could not fetch wishlist' });
    }
});

app.post('/api/wishlist/:productId', authenticateToken, async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid product ID' });
        const wishlist = await Wishlist.findOneAndUpdate(
            { user: req.user.userId },
            { $addToSet: { items: productId } },
            { new: true, upsert: true }
        );
        // Create notification
        await Notification.create({
            user: req.user.userId,
            type: 'wishlist',
            message: `Product added to your wishlist.`,
            relatedId: productId,
        });
        res.json({ items: wishlist.items });
    } catch (err) {
        console.error('Wishlist add error:', err);
        res.status(500).json({ error: 'Could not add favorite' });
    }
});

app.delete('/api/wishlist/:productId', authenticateToken, async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid product ID' });
        const wishlist = await Wishlist.findOneAndUpdate(
            { user: req.user.userId },
            { $pull: { items: productId } },
            { new: true }
        );
        // Create notification
        await Notification.create({
            user: req.user.userId,
            type: 'wishlist',
            message: `Product removed from your wishlist.`,
            relatedId: productId,
        });
        res.json({ items: wishlist ? wishlist.items : [] });
    } catch (err) {
        console.error('Wishlist remove error:', err);
        res.status(500).json({ error: 'Could not remove favorite' });
    }
});

// ============================================
// API ROUTES: REVIEWS
// ============================================
app.get('/api/reviews/:productId', async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid product ID' });
        const reviews = await Review.find({ productId }).populate('user', 'first_name last_name').sort({ created_at: -1 });
        const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
        res.json({ reviews, averageRating: avgRating.toFixed(1) });
    } catch (err) {
        console.error('Reviews get error:', err);
        res.status(500).json({ error: 'Could not fetch reviews' });
    }
});

app.post('/api/reviews/:productId', authenticateToken, async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        const { rating, review } = req.body;
        if (!Number.isInteger(productId) || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Invalid product ID or rating (1-5 required)' });
        }
        const existing = await Review.findOne({ user: req.user.userId, productId });
        if (existing) return res.status(400).json({ error: 'You have already reviewed this product' });
        const newReview = await Review.create({
            user: req.user.userId,
            productId,
            rating,
            review: review || '',
        });
        // Create notification
        await Notification.create({
            user: req.user.userId,
            type: 'review',
            message: `You reviewed a product with ${rating} stars.`,
            relatedId: productId,
        });
        res.status(201).json({ message: 'Review submitted', review: newReview });
    } catch (err) {
        console.error('Review submit error:', err);
        res.status(500).json({ error: 'Could not submit review' });
    }
});

// ============================================
// API ROUTES: NOTIFICATIONS
// ============================================
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.userId }).sort({ created_at: -1 });
        res.json({ notifications });
    } catch (err) {
        console.error('Notifications get error:', err);
        res.status(500).json({ error: 'Could not fetch notifications' });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user.userId },
            { isRead: true },
            { new: true }
        );
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        res.json({ message: 'Marked as read', notification });
    } catch (err) {
        console.error('Notification read error:', err);
        res.status(500).json({ error: 'Could not mark as read' });
    }
});

// ============================================
// API ROUTES: ANALYTICS (Admin Only)
// ============================================
app.get('/api/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // MongoDB: Total users
        const totalUsers = await User.countDocuments();

        // MySQL: Total products, total orders, sales summary
        const [productResult] = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) AS count FROM products', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        const totalProducts = productResult.count;

        const [orderResult] = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) AS count FROM orders', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        const totalOrders = orderResult.count;

        const [salesResult] = await new Promise((resolve, reject) => {
            db.query('SELECT SUM(total_amount) AS total FROM orders', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        const salesSummary = salesResult.total || 0;

        res.json({
            totalUsers,
            totalProducts,
            totalOrders,
            salesSummary: parseFloat(salesSummary).toFixed(2)
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ error: 'Could not fetch analytics' });
    }
});

// ============================================
// API ROUTES: PRODUCTS
// ============================================

// GET all products
app.get('/api/products', (req, res) => {
    db.query('SELECT * FROM products ORDER BY product_id', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// GET single product
app.get('/api/products/:id', (req, res) => {
    db.query('SELECT * FROM products WHERE product_id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(results[0]);
    });
});

// ============================================
// API ROUTES: CUSTOMERS
// ============================================

// GET all customers
app.get('/api/customers', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT * FROM customers ORDER BY customer_id', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// GET current user's customer profile
app.get('/api/customers/me', authenticateToken, (req, res) => {
    db.query('SELECT * FROM customers WHERE email = ? LIMIT 1', [req.user.email], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Customer profile not found' });
        res.json(results[0]);
    });
});

// POST create current user's customer profile
app.post('/api/customers/me', authenticateToken, async (req, res) => {
    const { first_name, last_name, phone, address } = req.body;
    try {
        const user = await User.findById(req.user.userId).select('first_name last_name email');
        if (!user) return res.status(404).json({ error: 'User not found' });

        db.query('SELECT * FROM customers WHERE email = ? LIMIT 1', [req.user.email], (checkErr, existing) => {
            if (checkErr) return res.status(500).json({ error: checkErr.message });
            if (existing.length > 0) return res.status(400).json({ error: 'Customer profile already exists' });

            const resolvedFirstName = first_name || user.first_name;
            const resolvedLastName = last_name || user.last_name;
            if (!resolvedFirstName || !resolvedLastName) {
                return res.status(400).json({ error: 'First name and last name are required' });
            }

            const sql = 'INSERT INTO customers (first_name, last_name, email, phone, address) VALUES (?, ?, ?, ?, ?)';
            db.query(sql, [resolvedFirstName, resolvedLastName, req.user.email, phone || 'N/A', address || 'N/A'], (err2, result) => {
                if (err2) {
                    if (err2.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: err2.message });
                }
                res.status(201).json({ customer_id: result.insertId, message: 'Customer profile created successfully' });
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Could not create customer profile' });
    }
});

// PUT update current user's customer profile
app.put('/api/customers/me', authenticateToken, (req, res) => {
    const { first_name, last_name, phone, address } = req.body;
    const sql = 'UPDATE customers SET first_name=?, last_name=?, phone=?, address=? WHERE email=?';
    db.query(sql, [first_name, last_name, phone || 'N/A', address || 'N/A', req.user.email], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer profile not found' });
        res.json({ message: 'Customer profile updated successfully' });
    });
});

// GET single customer
app.get('/api/customers/:id', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json(results[0]);
    });
});

// POST create customer
app.post('/api/customers', authenticateToken, requireAdmin, (req, res) => {
    const { first_name, last_name, email, phone, address } = req.body;
    if (!first_name || !last_name || !email) {
        return res.status(400).json({ error: 'First name, last name, and email are required' });
    }
    const sql = 'INSERT INTO customers (first_name, last_name, email, phone, address) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [first_name, last_name, email, phone || 'N/A', address || 'N/A'], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ customer_id: result.insertId, message: 'Customer created successfully' });
    });
});

// PUT update customer
app.put('/api/customers/:id', authenticateToken, requireAdmin, (req, res) => {
    const { first_name, last_name, email, phone, address } = req.body;
    const sql = 'UPDATE customers SET first_name=?, last_name=?, email=?, phone=?, address=? WHERE customer_id=?';
    db.query(sql, [first_name, last_name, email, phone, address, req.params.id], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer updated successfully' });
    });
});

// DELETE customer
app.delete('/api/customers/:id', authenticateToken, requireAdmin, (req, res) => {
    db.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer deleted successfully' });
    });
});

// ============================================
// API ROUTES: ORDERS
// ============================================

// GET all orders (with customer name and items)
app.get('/api/orders', authenticateToken, requireAdmin, (req, res) => {
    const sql = `
        SELECT o.order_id, o.customer_id, o.total_amount, o.order_date, o.status,
               c.first_name, c.last_name, c.email
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        ORDER BY o.order_id DESC
    `;
    db.query(sql, (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });

        if (orders.length === 0) return res.json([]);

        // Fetch items for all orders
        const orderIds = orders.map(o => o.order_id);
        const itemSql = `
            SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price,
                   p.product_name, p.brand
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id IN (?)
        `;
        db.query(itemSql, [orderIds], (err2, items) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const result = orders.map(order => ({
                ...order,
                items: items.filter(item => item.order_id === order.order_id)
            }));
            res.json(result);
        });
    });
});

// POST create order
app.post('/api/orders', authenticateToken, async (req, res) => {
    const { customer_id, items } = req.body;
    // items = [{ product_id, quantity }]

    if (!customer_id || !items || items.length === 0) {
        return res.status(400).json({ error: 'Customer ID and at least one item are required' });
    }

    // First, get product prices and check stock
    const productIds = items.map(i => i.product_id);
    db.query('SELECT * FROM products WHERE product_id IN (?)', [productIds], (err, products) => {
        if (err) return res.status(500).json({ error: err.message });

        // Validate stock
        for (const item of items) {
            const product = products.find(p => p.product_id === item.product_id);
            if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
            if (product.stock_quantity < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for ${product.product_name}` });
            }
        }

        // Calculate total
        let total = 0;
        const orderItems = items.map(item => {
            const product = products.find(p => p.product_id === item.product_id);
            const subtotal = product.price * item.quantity;
            total += subtotal;
            return { product_id: item.product_id, quantity: item.quantity, unit_price: product.price };
        });

        // Insert order
        db.query('INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)', [customer_id, total], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            const orderId = result.insertId;

            // Insert order items
            const itemValues = orderItems.map(i => [orderId, i.product_id, i.quantity, i.unit_price]);
            db.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ?', [itemValues], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });

                // Update stock for each product
                let updated = 0;
                const updateStock = async () => {
                    for (const item of items) {
                        db.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?',
                            [item.quantity, item.product_id], (err3) => {
                                if (err3) console.error('Stock update error:', err3.message);
                                if (++updated === items.length) {
                                    // Create order tracking record
                                    OrderTracking.create({
                                        order_id: orderId,
                                        user_id: req.user.userId,
                                        status: 'pending'
                                    }).catch(trackingErr => {
                                        console.error('Order tracking creation error:', trackingErr);
                                        // Don't fail the order creation if tracking fails
                                    });

                                    createNotificationFromRequest(req, 'order', `Your order #${orderId} has been placed successfully.`, orderId);
                                    res.status(201).json({ order_id: orderId, total_amount: total, message: 'Order placed successfully' });
                                }
                            });
                    }
                };
                updateStock();
            });
        });
    });
});

// PUT update order item quantity
app.put('/api/orders/:orderId/items/:productId', (req, res) => {
    const { orderId, productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
        return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    // Get current order item
    const sql = 'SELECT oi.*, p.stock_quantity FROM order_items oi JOIN products p ON oi.product_id = p.product_id WHERE oi.order_id = ? AND oi.product_id = ?';
    db.query(sql, [orderId, productId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Order item not found' });

        const item = results[0];
        const diff = quantity - item.quantity;

        // Check stock for increase
        if (diff > 0 && item.stock_quantity < diff) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // Update quantity
        db.query('UPDATE order_items SET quantity = ? WHERE order_id = ? AND product_id = ?', [quantity, orderId, productId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });

            // Adjust stock
            db.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?', [diff, productId], (err3) => {
                if (err3) return res.status(500).json({ error: err3.message });

                // Recalculate order total
                db.query('SELECT SUM(quantity * unit_price) AS total FROM order_items WHERE order_id = ?', [orderId], (err4, totals) => {
                    if (err4) return res.status(500).json({ error: err4.message });

                    const newTotal = totals[0].total || 0;
                    db.query('UPDATE orders SET total_amount = ? WHERE order_id = ?', [newTotal, orderId], (err5) => {
                        if (err5) return res.status(500).json({ error: err5.message });
                        res.json({ message: 'Order item updated', new_total: newTotal });
                    });
                });
            });
        });
    });
});

// DELETE remove an item from an order
app.delete('/api/orders/:orderId/items/:productId', (req, res) => {
    const { orderId, productId } = req.params;

    // Get item details for stock restoration
    db.query('SELECT * FROM order_items WHERE order_id = ? AND product_id = ?', [orderId, productId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Order item not found' });

        const item = results[0];

        // Delete the item
        db.query('DELETE FROM order_items WHERE order_id = ? AND product_id = ?', [orderId, productId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });

            // Restore stock
            db.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?', [item.quantity, productId], (err3) => {
                if (err3) return res.status(500).json({ error: err3.message });

                // Check if order has remaining items
                db.query('SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?', [orderId], (err4, counts) => {
                    if (err4) return res.status(500).json({ error: err4.message });

                    if (counts[0].count === 0) {
                        // No items left, delete the order
                        db.query('DELETE FROM orders WHERE order_id = ?', [orderId], (err5) => {
                            if (err5) return res.status(500).json({ error: err5.message });
                            res.json({ message: 'Order deleted (no items remaining)' });
                        });
                    } else {
                        // Recalculate total
                        db.query('SELECT SUM(quantity * unit_price) AS total FROM order_items WHERE order_id = ?', [orderId], (err5, totals) => {
                            if (err5) return res.status(500).json({ error: err5.message });
                            db.query('UPDATE orders SET total_amount = ? WHERE order_id = ?', [totals[0].total, orderId], () => {
                                res.json({ message: 'Item removed from order' });
                            });
                        });
                    }
                });
            });
        });
    });
});

// DELETE entire order
app.delete('/api/orders/:id', authenticateToken, requireAdmin, (req, res) => {
    const orderId = req.params.id;

    // Get all items to restore stock
    db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err, items) => {
        if (err) return res.status(500).json({ error: err.message });

        // Delete the order (cascades to order_items)
        db.query('DELETE FROM orders WHERE order_id = ?', [orderId], (err2, result) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found' });

            // Restore stock for each item
            let restored = 0;
            if (items.length === 0) return res.json({ message: 'Order deleted successfully' });

            for (const item of items) {
                db.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?',
                    [item.quantity, item.product_id], () => {
                        restored++;
                        if (restored === items.length) {
                            res.json({ message: 'Order deleted and stock restored' });
                        }
                    });
            }
        });
    });
});

// ============================================
// API ROUTES: ORDER TRACKING
// ============================================

// GET order tracking for customer (their own orders)
app.get('/api/order-tracking', authenticateToken, async (req, res) => {
    try {
        const tracking = await OrderTracking.find({ user_id: req.user.userId })
            .populate('user_id', 'first_name last_name email')
            .sort({ created_at: -1 });

        // Get order details from MySQL for each tracking record
        const trackingWithOrders = await Promise.all(tracking.map(async (track) => {
            return new Promise((resolve) => {
                const sql = `
                    SELECT o.order_id, o.total_amount, o.order_date,
                           c.first_name, c.last_name, c.email
                    FROM orders o
                    JOIN customers c ON o.customer_id = c.customer_id
                    WHERE o.order_id = ?
                `;
                db.query(sql, [track.order_id], (err, results) => {
                    if (err || results.length === 0) {
                        resolve({
                            ...track.toObject(),
                            order: null
                        });
                    } else {
                        resolve({
                            ...track.toObject(),
                            order: results[0]
                        });
                    }
                });
            });
        }));

        res.json(trackingWithOrders);
    } catch (err) {
        console.error('Order tracking fetch error:', err);
        res.status(500).json({ error: 'Could not fetch order tracking' });
    }
});

// GET specific order tracking (for customers and admins)
app.get('/api/order-tracking/:orderId', authenticateToken, async (req, res) => {
    try {
        const tracking = await OrderTracking.findOne({ order_id: parseInt(req.params.orderId) })
            .populate('user_id', 'first_name last_name email')
            .populate('status_history.updated_by', 'first_name last_name');

        if (!tracking) {
            return res.status(404).json({ error: 'Order tracking not found' });
        }

        // Check if user owns this order or is admin
        if (tracking.user_id._id.toString() !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get order details from MySQL
        const sql = `
            SELECT o.order_id, o.total_amount, o.order_date,
                   c.first_name, c.last_name, c.email
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = ?
        `;
        db.query(sql, [tracking.order_id], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                ...tracking.toObject(),
                order: results[0] || null
            });
        });
    } catch (err) {
        console.error('Order tracking fetch error:', err);
        res.status(500).json({ error: 'Could not fetch order tracking' });
    }
});

// PUT update order status (Admin only)
app.put('/api/order-tracking/:orderId/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, notes, estimated_delivery, tracking_number } = req.body;

        if (!['pending', 'processing', 'shipped', 'delivered'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const tracking = await OrderTracking.findOne({ order_id: parseInt(req.params.orderId) });
        if (!tracking) {
            return res.status(404).json({ error: 'Order tracking not found' });
        }

        // Set the user who updated for history
        tracking._updatedBy = req.user.userId;
        tracking.status = status;

        if (notes) {
            tracking.status_history[tracking.status_history.length - 1].notes = notes;
        }

        if (estimated_delivery) {
            tracking.estimated_delivery = new Date(estimated_delivery);
        }

        if (tracking_number) {
            tracking.tracking_number = tracking_number;
        }

        await tracking.save();

        // Create notification for customer
        const notification = await Notification.create({
            user: tracking.user_id,
            type: 'order_update',
            message: `Your order #${tracking.order_id} status has been updated to ${status}.`,
            relatedId: tracking.order_id
        });

        res.json({
            message: 'Order status updated successfully',
            tracking: tracking
        });
    } catch (err) {
        console.error('Order status update error:', err);
        res.status(500).json({ error: 'Could not update order status' });
    }
});

// GET all order tracking (Admin only)
app.get('/api/admin/order-tracking', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tracking = await OrderTracking.find({})
            .populate('user_id', 'first_name last_name email')
            .sort({ updated_at: -1 });

        // Get order details from MySQL for each tracking record
        const trackingWithOrders = await Promise.all(tracking.map(async (track) => {
            return new Promise((resolve) => {
                const sql = `
                    SELECT o.order_id, o.total_amount, o.order_date,
                           c.first_name, c.last_name, c.email
                    FROM orders o
                    JOIN customers c ON o.customer_id = c.customer_id
                    WHERE o.order_id = ?
                `;
                db.query(sql, [track.order_id], (err, results) => {
                    if (err || results.length === 0) {
                        resolve({
                            ...track.toObject(),
                            order: null
                        });
                    } else {
                        resolve({
                            ...track.toObject(),
                            order: results[0]
                        });
                    }
                });
            });
        }));

        res.json(trackingWithOrders);
    } catch (err) {
        console.error('Admin order tracking fetch error:', err);
        res.status(500).json({ error: 'Could not fetch order tracking' });
    }
});

// ============================================
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: true }));

// ============================================
// Serve HTML pages
// ============================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'customer.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/ordertable', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ordertable.html')));

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`Aromano Co. server running at http://localhost:${PORT}`);
});
