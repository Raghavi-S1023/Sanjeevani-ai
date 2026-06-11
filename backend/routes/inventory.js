/**
 * Inventory Management API Routes
 * Track inventory levels and transactions
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../database/db');

/**
 * GET /api/inventory - Get inventory overview
 */
router.get('/', async (req, res) => {
  try {
    const totalMedicines = await dbGet(`
      SELECT COUNT(*) as count, SUM(quantity) as total_quantity FROM medicines WHERE is_active = 1
    `);

    const lowStock = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND quantity < 10
    `);

    const outOfStock = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND quantity = 0
    `);

    res.json({
      total_medicines: totalMedicines.count || 0,
      total_quantity: totalMedicines.total_quantity || 0,
      low_stock_count: lowStock.length,
      out_of_stock_count: outOfStock.length,
      low_stock_medicines: lowStock,
      out_of_stock_medicines: outOfStock
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/transactions - Get inventory transaction history
 */
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await dbAll(`
      SELECT it.*, m.medicine_name, u.full_name 
      FROM inventory_transactions it
      LEFT JOIN medicines m ON it.medicine_id = m.id
      LEFT JOIN users u ON it.performed_by_id = u.id
      ORDER BY it.created_at DESC
    `);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/check - Check inventory levels
 */
router.post('/check', async (req, res) => {
  try {
    const { medicine_id, required_quantity } = req.body;

    const medicine = await dbGet(`
      SELECT * FROM medicines WHERE id = ? AND is_active = 1
    `, [medicine_id]);

    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const isExpired = medicine.expiry_date < today;
    const isAvailable = medicine.quantity >= (required_quantity || 1);

    res.json({
      available: isAvailable && !isExpired,
      medicine: medicine,
      quantity_available: medicine.quantity,
      required_quantity: required_quantity || 1,
      is_expired: isExpired,
      expiry_date: medicine.expiry_date,
      days_until_expiry: calculateDaysUntilExpiry(medicine.expiry_date)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Calculate days until expiry
 */
function calculateDaysUntilExpiry(expiryDate) {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

module.exports = router;
