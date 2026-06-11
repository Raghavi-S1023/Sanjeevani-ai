/**
 * Stock Prediction API Routes
 * Predict stock-out dates using AI/ML algorithms
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../database/db');

/**
 * Calculate average daily consumption
 */
async function calculateAverageDailyConsumption(medicineId) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await dbGet(`
      SELECT 
        SUM(quantity_dispensed) as total_dispensed,
        COUNT(DISTINCT DATE(created_at)) as days_with_dispensing
      FROM dispensing_logs
      WHERE medicine_id = ? AND created_at >= ?
    `, [medicineId, thirtyDaysAgo]);

    const totalDispensed = result?.total_dispensed || 0;
    const daysWithDispensing = result?.days_with_dispensing || 1;
    
    return totalDispensed / 30; // Average per day over 30 days
  } catch (err) {
    console.error('Error calculating consumption:', err);
    return 0;
  }
}

/**
 * Calculate estimated stock-out date
 */
function calculateStockoutDate(currentQuantity, averageDailyConsumption) {
  if (averageDailyConsumption <= 0) return null;
  
  const daysUntilStockout = Math.ceil(currentQuantity / averageDailyConsumption);
  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + daysUntilStockout);
  
  return {
    date: stockoutDate.toISOString().split('T')[0],
    days: daysUntilStockout
  };
}

/**
 * POST /api/predictions/generate - Generate stock predictions
 */
router.post('/generate', async (req, res) => {
  try {
    const medicines = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1
    `);

    const predictions = [];

    for (const medicine of medicines) {
      const avgConsumption = await calculateAverageDailyConsumption(medicine.id);
      const stockoutInfo = calculateStockoutDate(medicine.quantity, avgConsumption);

      let recommendation = 'No action needed';
      let severity = 'low';

      if (stockoutInfo && stockoutInfo.days <= 7) {
        recommendation = `URGENT: Reorder required. Expected to run out in ${stockoutInfo.days} days`;
        severity = 'high';
      } else if (stockoutInfo && stockoutInfo.days <= 14) {
        recommendation = `Consider reordering soon. Expected to run out in ${stockoutInfo.days} days`;
        severity = 'medium';
      } else if (medicine.quantity < 10) {
        recommendation = 'Stock level is low, consider reordering';
        severity = 'medium';
      }

      // Store prediction
      await dbRun(`
        INSERT INTO stock_predictions (
          medicine_id, current_quantity, average_daily_consumption,
          estimated_stockout_date, days_until_stockout, recommendation
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        medicine.id,
        medicine.quantity,
        avgConsumption,
        stockoutInfo?.date || null,
        stockoutInfo?.days || null,
        recommendation
      ]);

      // Create notification if urgent
      if (severity === 'high') {
        await dbRun(`
          INSERT INTO notifications (title, message, notification_type, medicine_id, severity)
          VALUES (?, ?, ?, ?, ?)
        `, [
          'Stock-Out Alert',
          `${medicine.medicine_name} will run out in ${stockoutInfo.days} days`,
          'stockout',
          medicine.id,
          'high'
        ]);
      }

      predictions.push({
        medicine_id: medicine.id,
        medicine_name: medicine.medicine_name,
        current_quantity: medicine.quantity,
        average_daily_consumption: avgConsumption.toFixed(2),
        estimated_stockout_date: stockoutInfo?.date,
        days_until_stockout: stockoutInfo?.days,
        recommendation: recommendation,
        severity: severity
      });
    }

    res.json({
      message: 'Predictions generated successfully',
      predictions: predictions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/predictions/urgent - Get urgent predictions (within 7 days)
 */
router.get('/urgent', async (req, res) => {
  try {
    const urgentPredictions = await dbAll(`
      SELECT * FROM stock_predictions
      WHERE days_until_stockout IS NOT NULL AND days_until_stockout <= 7
      ORDER BY days_until_stockout ASC
    `);
    res.json(urgentPredictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
