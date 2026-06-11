/**
 * Medicines API Routes
 * CRUD operations for medicine inventory
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../database/db');

/**
 * GET /api/medicines - Get all medicines
 */
router.get('/', async (req, res) => {
  try {
    const medicines = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 ORDER BY expiry_date ASC
    `);
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/medicines/:id - Get single medicine
 */
router.get('/:id', async (req, res) => {
  try {
    const medicine = await dbGet(`
      SELECT * FROM medicines WHERE id = ? AND is_active = 1
    `, [req.params.id]);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    res.json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/medicines - Add new medicine
 */
router.post('/', async (req, res) => {
  try {
    const {
      medicine_name, batch_number, manufacturer, manufacturing_date,
      expiry_date, quantity, unit, storage_condition, supplier,
      price_per_unit, barcode, qr_code, notes
    } = req.body;

    if (!medicine_name || !batch_number || !expiry_date || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await dbRun(`
      INSERT INTO medicines (
        medicine_name, batch_number, manufacturer, manufacturing_date,
        expiry_date, quantity, unit, storage_condition, supplier,
        price_per_unit, barcode, qr_code, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [medicine_name, batch_number, manufacturer, manufacturing_date,
        expiry_date, quantity, unit, storage_condition, supplier,
        price_per_unit, barcode, qr_code, notes]);

    // Log audit
    await dbRun(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
      VALUES (?, ?, ?, ?)
    `, ['ADD_MEDICINE', 'medicines', result.id, medicine_name]);

    res.status(201).json({ id: result.id, message: 'Medicine added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/medicines/:id - Update medicine
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await dbRun(`UPDATE medicines SET ${fields.join(', ')} WHERE id = ?`, values);

    // Log audit
    await dbRun(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
      VALUES (?, ?, ?, ?)
    `, ['EDIT_MEDICINE', 'medicines', id, JSON.stringify(updates)]);

    res.json({ message: 'Medicine updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/medicines/:id - Soft delete medicine
 */
router.delete('/:id', async (req, res) => {
  try {
    await dbRun(`UPDATE medicines SET is_active = 0 WHERE id = ?`, [req.params.id]);

    // Log audit
    await dbRun(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
      VALUES (?, ?, ?, ?)
    `, ['DELETE_MEDICINE', 'medicines', req.params.id, 'Medicine deleted']);

    res.json({ message: 'Medicine deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/medicines/search/:query - Search medicines
 */
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const medicines = await dbAll(`
      SELECT * FROM medicines 
      WHERE is_active = 1 AND (
        medicine_name LIKE ? OR 
        batch_number LIKE ? OR 
        manufacturer LIKE ?
      )
    `, [`%${query}%`, `%${query}%`, `%${query}%`]);
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/medicines/expiry/status - Get expiry status
 */
router.get('/expiry/status', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const expired = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND expiry_date < ?
    `, [today]);

    const expiringSoon = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND expiry_date BETWEEN ? AND ?
    `, [today, thirtyDaysLater]);

    const safe = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND expiry_date > ?
    `, [thirtyDaysLater]);

    res.json({
      expired: expired.length,
      expiring_soon: expiringSoon.length,
      safe: safe.length,
      expired_medicines: expired,
      expiring_soon_medicines: expiringSoon
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
