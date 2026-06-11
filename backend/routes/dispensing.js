/**
 * Dispensing API Routes
 * Endpoints for verifying and dispensing medicines
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');

/**
 * POST /api/dispensing/verify
 * Verify medicine before dispensing
 * Body: { medicine_id, batch_id }
 */
router.post('/verify', async (req, res) => {
  try {
    const { medicine_id, batch_id } = req.body;

    if (!medicine_id || !batch_id) {
      return res.status(400).json({ error: 'Missing required fields: medicine_id, batch_id' });
    }

    // Get medicine details
    const medicine = await db.get(
      'SELECT * FROM medicines WHERE id = ? AND is_active = 1',
      [medicine_id]
    );

    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    // Get batch details
    const batch = await db.get(
      'SELECT * FROM batches WHERE id = ? AND medicine_id = ?',
      [batch_id, medicine_id]
    );

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Check expiry status
    const expiryDate = new Date(batch.expiry_date);
    const today = new Date();
    const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    let expiryStatus = 'valid';
    let expiredFlag = false;
    let warning = null;

    if (daysToExpiry < 0) {
      expiryStatus = 'expired';
      expiredFlag = true;
      warning = `❌ EXPIRED - This medicine expired ${Math.abs(daysToExpiry)} days ago`;
    } else if (daysToExpiry < 7) {
      expiryStatus = 'expiring_soon';
      warning = `⚠️ EXPIRING SOON - Only ${daysToExpiry} days left`;
    } else if (daysToExpiry < 30) {
      expiryStatus = 'expiring_in_30';
      warning = `⚠️ EXPIRES IN ${daysToExpiry} days`;
    }

    // Get current stock
    const inventory = await db.get(
      'SELECT current_stock FROM inventory WHERE medicine_id = ? AND batch_id = ?',
      [medicine_id, batch_id]
    );

    res.json({
      success: true,
      data: {
        medicine,
        batch,
        verification: {
          is_valid: !expiredFlag && batch.status !== 'recalled',
          expiry_status: expiryStatus,
          days_to_expiry: daysToExpiry,
          current_stock: inventory ? inventory.current_stock : 0,
          status: batch.status,
          warning
        }
      }
    });
  } catch (error) {
    console.error('Error verifying medicine:', error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

/**
 * POST /api/dispensing/dispense
 * Record medicine dispensing
 * Body: { user_id, medicine_id, batch_id, quantity_dispensed, patient_name, patient_age, patient_gender, diagnosis, notes }
 */
router.post('/dispense', async (req, res) => {
  try {
    const {
      user_id,
      medicine_id,
      batch_id,
      quantity_dispensed,
      patient_name,
      patient_age,
      patient_gender,
      diagnosis,
      notes
    } = req.body;

    // Validate required fields
    if (!user_id || !medicine_id || !batch_id || !quantity_dispensed) {
      return res.status(400).json({
        error: 'Missing required fields: user_id, medicine_id, batch_id, quantity_dispensed'
      });
    }

    // Verify medicine and check expiry
    const batch = await db.get(
      'SELECT * FROM batches WHERE id = ? AND medicine_id = ?',
      [batch_id, medicine_id]
    );

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Check if medicine is expired
    const expiryDate = new Date(batch.expiry_date);
    const today = new Date();
    const isExpired = expiryDate < today;

    if (isExpired) {
      return res.status(400).json({
        error: 'Cannot dispense expired medicine',
        batch_id,
        expiry_date: batch.expiry_date
      });
    }

    // Get current inventory
    const inventory = await db.get(
      'SELECT * FROM inventory WHERE medicine_id = ? AND batch_id = ?',
      [medicine_id, batch_id]
    );

    if (!inventory || inventory.current_stock < quantity_dispensed) {
      return res.status(400).json({
        error: 'Insufficient stock',
        available: inventory ? inventory.current_stock : 0,
        requested: quantity_dispensed
      });
    }

    // Determine expiry status
    const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
    let expiryStatus = 'valid';
    if (daysToExpiry < 7) expiryStatus = 'expiring_soon';
    else if (daysToExpiry < 30) expiryStatus = 'expiring_in_30';

    // Record dispensing log
    const dispensingResult = await db.run(
      `INSERT INTO dispensing_logs 
       (user_id, medicine_id, batch_id, quantity_dispensed, patient_name, patient_age, patient_gender, diagnosis, expiry_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, medicine_id, batch_id, quantity_dispensed, patient_name, patient_age, patient_gender, diagnosis, expiryStatus, notes]
    );

    // Update inventory
    const newStock = inventory.current_stock - quantity_dispensed;
    await db.run(
      'UPDATE inventory SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStock, inventory.id]
    );

    // Update batch quantity remaining
    const newBatchQty = batch.quantity_remaining - quantity_dispensed;
    await db.run(
      'UPDATE batches SET quantity_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newBatchQty, batch_id]
    );

    // Create audit log
    await db.run(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
       VALUES (?, ?, ?, ?, ?)`,
      [
        user_id,
        'DISPENSE',
        'dispensing_logs',
        dispensingResult.lastID,
        JSON.stringify({
          medicine_id,
          batch_id,
          quantity: quantity_dispensed,
          patient: patient_name
        })
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Medicine dispensed successfully',
      data: {
        dispensing_id: dispensingResult.lastID,
        new_stock: newStock,
        warning: expiryStatus !== 'valid' ? `Medicine ${expiryStatus}` : null
      }
    });
  } catch (error) {
    console.error('Error dispensing medicine:', error);
    res.status(500).json({ error: 'Dispensing failed', details: error.message });
  }
});

/**
 * GET /api/dispensing/logs
 * Get dispensing history with pagination
 */
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const logs = await db.all(`
      SELECT 
        d.*,
        m.name as medicine_name,
        b.batch_number,
        u.name as healthcare_worker
      FROM dispensing_logs d
      JOIN medicines m ON d.medicine_id = m.id
      JOIN batches b ON d.batch_id = b.id
      JOIN users u ON d.user_id = u.id
      ORDER BY d.dispensed_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // Get total count
    const countResult = await db.get('SELECT COUNT(*) as count FROM dispensing_logs');

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total: countResult.count,
        pages: Math.ceil(countResult.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching dispensing logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
  }
});

module.exports = router;
