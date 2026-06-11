/**
 * Users API Routes
 * Endpoints for user management
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');
const bcrypt = require('bcryptjs');

/**
 * GET /api/users
 * Get all users
 */
router.get('/', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, name, email, phone, role, clinic_name, clinic_location, created_at, is_active
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.get(
      'SELECT id, name, email, phone, role, clinic_name, clinic_location, created_at FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

/**
 * POST /api/users
 * Create new user
 * Body: { name, email, phone, role, clinic_name, clinic_location, password }
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, role, clinic_name, clinic_location, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields: name, email, password' });
    }

    // Check if email already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.run(
      `INSERT INTO users (name, email, phone, role, clinic_name, clinic_location, password)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, phone, role || 'healthcare_worker', clinic_name, clinic_location, hashedPassword]
    );

    const user = await db.get(
      'SELECT id, name, email, phone, role, clinic_name, created_at FROM users WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

/**
 * PUT /api/users/:id
 * Update user
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, clinic_name, clinic_location } = req.body;

    // Check if user exists
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    await db.run(
      `UPDATE users SET 
       name = COALESCE(?, name),
       phone = COALESCE(?, phone),
       role = COALESCE(?, role),
       clinic_name = COALESCE(?, clinic_name),
       clinic_location = COALESCE(?, clinic_location),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, phone, role, clinic_name, clinic_location, id]
    );

    const updatedUser = await db.get(
      'SELECT id, name, email, phone, role, clinic_name, clinic_location FROM users WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

module.exports = router;