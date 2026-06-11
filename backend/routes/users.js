/**
 * Users API Routes
 * Handle user authentication and management
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../database/db');
const crypto = require('crypto');

/**
 * Hash password (simple implementation - use bcrypt in production)
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * POST /api/users/register - Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, full_name, role, facility_name, phone } = req.body;

    if (!username || !password || !email || !full_name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validRoles = ['admin', 'pharmacist', 'health_worker'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const hashedPassword = hashPassword(password);

    try {
      const result = await dbRun(`
        INSERT INTO users (username, password, email, full_name, role, facility_name, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [username, hashedPassword, email, full_name, role, facility_name, phone]);

      res.status(201).json({ id: result.id, message: 'User registered successfully' });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users/login - Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const hashedPassword = hashPassword(password);
    const user = await dbGet(`
      SELECT * FROM users WHERE username = ? AND password = ? AND is_active = 1
    `, [username, hashedPassword]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      facility_name: user.facility_name,
      message: 'Login successful'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users/:id - Get user details
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await dbGet(`
      SELECT id, username, email, full_name, role, facility_name, phone, is_active, created_at 
      FROM users WHERE id = ?
    `, [req.params.id]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/users/:id - Update user
 */
router.put('/:id', async (req, res) => {
  try {
    const { full_name, email, phone, facility_name } = req.body;

    await dbRun(`
      UPDATE users SET full_name = ?, email = ?, phone = ?, facility_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [full_name, email, phone, facility_name, req.params.id]);

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users - Get all users (admin only)
 */
router.get('/', async (req, res) => {
  try {
    const users = await dbAll(`
      SELECT id, username, email, full_name, role, facility_name, is_active, created_at 
      FROM users ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
