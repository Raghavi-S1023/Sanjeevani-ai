/**
 * Predictions API Routes
 * Endpoints for AI predictions (stock-out, expiry warnings, counterfeit detection)
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');

/**
 * GET /api/predictions/stockout
 * Get stock-out predictions
 */
router.get('/stockout', async (req, res) => {
  try {
    const predictions = await db.all(`
      SELECT 
        p.*,
        m.name as medicine_name,
        m.manufacturer
      FROM predictions p
      JOIN medicines m ON p.medicine_id = m.id
      WHERE p.prediction_type = 'stockout'
      AND p.is_acknowledged = 0
      ORDER BY p.urgency_level DESC, p.predicted_date ASC
    `);

    res.json({
      success: true,
      data: predictions,
      count: predictions.length
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions', details: error.message });
  }
});

/**
 * GET /api/predictions/expiry
 * Get expiry warnings
 */
router.get('/expiry', async (req, res) => {
  try {
    const warnings = await db.all(`
      SELECT 
        p.*,
        m.name as medicine_name,
        b.batch_number,
        b.expiry_date
      FROM predictions p
      JOIN medicines m ON p.medicine_id = m.id
      LEFT JOIN batches b ON p.medicine_id = b.medicine_id
      WHERE p.prediction_type = 'expiry_warning'
      AND p.is_acknowledged = 0
      ORDER BY b.expiry_date ASC
    `);

    res.json({
      success: true,
      data: warnings,
      count: warnings.length
    });
  } catch (error) {
    console.error('Error fetching expiry warnings:', error);
    res.status(500).json({ error: 'Failed to fetch warnings', details: error.message });
  }
});

/**
 * GET /api/predictions/counterfeit
 * Get counterfeit flags
 */
router.get('/counterfeit', async (req, res) => {
  try {
    const flags = await db.all(`
      SELECT 
        p.*,
        m.name as medicine_name,
        b.batch_number
      FROM predictions p
      JOIN medicines m ON p.medicine_id = m.id
      LEFT JOIN batches b ON p.medicine_id = b.medicine_id
      WHERE p.prediction_type = 'counterfeit_flag'
      AND p.is_acknowledged = 0
      ORDER BY p.confidence_score DESC
    `);

    res.json({
      success: true,
      data: flags,
      count: flags.length
    });
  } catch (error) {
    console.error('Error fetching counterfeit flags:', error);
    res.status(500).json({ error: 'Failed to fetch flags', details: error.message });
  }
});

/**
 * POST /api/predictions/acknowledge
 * Acknowledge a prediction
 * Body: { prediction_id, user_id }
 */
router.post('/acknowledge', async (req, res) => {
  try {
    const { prediction_id, user_id } = req.body;

    if (!prediction_id || !user_id) {
      return res.status(400).json({ error: 'Missing required fields: prediction_id, user_id' });
    }

    await db.run(
      `UPDATE predictions SET is_acknowledged = 1, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user_id, prediction_id]
    );

    res.json({
      success: true,
      message: 'Prediction acknowledged'
    });
  } catch (error) {
    console.error('Error acknowledging prediction:', error);
    res.status(500).json({ error: 'Failed to acknowledge prediction', details: error.message });
  }
});

/**
 * POST /api/predictions/calculate
 * Calculate predictions based on dispensing patterns (AI Engine)
 */
router.post('/calculate', async (req, res) => {
  try {
    // Get all medicines
    const medicines = await db.all('SELECT * FROM medicines WHERE is_active = 1');

    const predictions = [];

    for (const medicine of medicines) {
      // Get dispensing logs for last 30 days
      const logs = await db.all(
        `SELECT SUM(quantity_dispensed) as total FROM dispensing_logs 
         WHERE medicine_id = ? AND dispensed_at > datetime('now', '-30 days')`,
        [medicine.id]
      );

      const totalDispensed = logs[0]?.total || 0;
      const avgDaily = totalDispensed / 30;

      // Get current inventory
      const inventory = await db.all(
        `SELECT SUM(current_stock) as total FROM inventory WHERE medicine_id = ?`,
        [medicine.id]
      );

      const currentStock = inventory[0]?.total || 0;

      // Calculate stock-out date
      if (avgDaily > 0) {
        const daysLeft = Math.floor(currentStock / avgDaily);
        const predictedDate = new Date();
        predictedDate.setDate(predictedDate.getDate() + daysLeft);

        // Determine urgency
        let urgency = 'low';
        if (daysLeft < 7) urgency = 'critical';
        else if (daysLeft < 14) urgency = 'high';
        else if (daysLeft < 30) urgency = 'medium';

        predictions.push({
          medicine_id: medicine.id,
          prediction_type: 'stockout',
          predicted_date: predictedDate.toISOString().split('T')[0],
          average_daily_consumption: avgDaily,
          confidence_score: 85,
          urgency_level: urgency,
          reorder_quantity: Math.ceil(totalDispensed / 2)
        });
      }

      // Check expiry dates
      const expiringBatches = await db.all(
        `SELECT * FROM batches WHERE medicine_id = ? 
         AND expiry_date BETWEEN date('now') AND date('now', '+30 days')`,
        [medicine.id]
      );

      for (const batch of expiringBatches) {
        predictions.push({
          medicine_id: medicine.id,
          prediction_type: 'expiry_warning',
          predicted_date: batch.expiry_date,
          confidence_score: 100,
          urgency_level: 'high'
        });
      }
    }

    res.json({
      success: true,
      message: 'Predictions calculated',
      data: predictions
    });
  } catch (error) {
    console.error('Error calculating predictions:', error);
    res.status(500).json({ error: 'Prediction calculation failed', details: error.message });
  }
});

module.exports = router;