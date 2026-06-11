/**
 * Dispensing API Routes
 * Handle medicine dispensing and verification
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../database/db');

/**
 * POST /api/dispensing/dispense - Record medicine dispensing
 */
router.post('/dispense', async (req, res) => {
  try {
    const {
      medicine_id,
      quantity_dispensed,
      dispensed_by_id,
      patient_name,
      patient_age,
      patient_phone,
      dispensing_notes
    } = req.body;

    if (!medicine_id || !quantity_dispensed || !dispensed_by_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify medicine exists and is not expired
    const medicine = await dbGet(`
      SELECT * FROM medicines WHERE id = ? AND is_active = 1
    `, [medicine_id]);

    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (medicine.expiry_date < today) {
      return res.status(400).json({ error: 'Cannot dispense expired medicine' });
    }

    if (medicine.quantity < quantity_dispensed) {
      return res.status(400).json({ error: 'Insufficient quantity available' });
    }

    // Record dispensing
    const result = await dbRun(`
      INSERT INTO dispensing_logs (
        medicine_id, quantity_dispensed, dispensed_by_id,
        patient_name, patient_age, patient_phone, dispensing_notes, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [medicine_id, quantity_dispensed, dispensed_by_id,
        patient_name, patient_age, patient_phone, dispensing_notes, 1]);

    // Update medicine quantity
    const newQuantity = medicine.quantity - quantity_dispensed;
    await dbRun(`UPDATE medicines SET quantity = ? WHERE id = ?`, [newQuantity, medicine_id]);

    // Log audit
    await dbRun(`
      INSERT INTO audit_logs (action, entity_type, entity_id, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
    `, ['DISPENSE_MEDICINE', 'dispensing_logs', result.id, medicine.quantity, newQuantity]);

    // Create notification if stock is low
    if (newQuantity < 10) {
      await dbRun(`
        INSERT INTO notifications (title, message, notification_type, medicine_id, severity)
        VALUES (?, ?, ?, ?, ?)
      `, [
        'Low Stock Alert',
        `${medicine.medicine_name} stock is now ${newQuantity} units`,
        'low_stock',
        medicine_id,
        newQuantity === 0 ? 'high' : 'medium'
      ]);
    }

    res.status(201).json({
      id: result.id,
      message: 'Medicine dispensed successfully',
      remaining_quantity: newQuantity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dispensing/history - Get dispensing history
 */
router.get('/history', async (req, res) => {
  try {
    const history = await dbAll(`
      SELECT dl.*, m.medicine_name, u.full_name 
      FROM dispensing_logs dl
      LEFT JOIN medicines m ON dl.medicine_id = m.id
      LEFT JOIN users u ON dl.dispensed_by_id = u.id
      ORDER BY dl.created_at DESC
    `);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dispensing/monthly - Get monthly dispensing statistics
 */
router.get('/monthly', async (req, res) => {
  try {
    const stats = await dbAll(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        medicine_id,
        SUM(quantity_dispensed) as total_dispensed,
        COUNT(*) as transaction_count,
        m.medicine_name
      FROM dispensing_logs dl
      LEFT JOIN medicines m ON dl.medicine_id = m.id
      GROUP BY month, medicine_id
      ORDER BY month DESC
    `);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
