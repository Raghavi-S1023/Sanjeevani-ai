/**
 * Reports API Routes
 * Endpoints for generating various reports
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');

/**
 * GET /api/reports/expiry
 * Generate expiry report
 */
router.get('/expiry', async (req, res) => {
  try {
    const report = await db.all(`
      SELECT 
        m.name,
        m.manufacturer,
        b.batch_number,
        b.expiry_date,
        i.current_stock,
        CASE 
          WHEN b.expiry_date < date('now') THEN 'EXPIRED'
          WHEN b.expiry_date < date('now', '+7 days') THEN 'EXPIRING (0-7 days)'
          WHEN b.expiry_date < date('now', '+30 days') THEN 'EXPIRING (7-30 days)'
          ELSE 'VALID'
        END as status,
        CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_remaining
      FROM inventory i
      JOIN medicines m ON i.medicine_id = m.id
      JOIN batches b ON i.batch_id = b.id
      WHERE b.expiry_date <= date('now', '+30 days')
      ORDER BY b.expiry_date ASC
    `);

    const summary = {
      total_items: report.length,
      expired: report.filter(r => r.status === 'EXPIRED').length,
      expiring_7_days: report.filter(r => r.status === 'EXPIRING (0-7 days)').length,
      expiring_30_days: report.filter(r => r.status === 'EXPIRING (7-30 days)').length,
      generated_at: new Date().toISOString()
    };

    res.json({
      success: true,
      report_type: 'Expiry Report',
      summary,
      data: report
    });
  } catch (error) {
    console.error('Error generating expiry report:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

/**
 * GET /api/reports/lowstock
 * Generate low stock report
 */
router.get('/lowstock', async (req, res) => {
  try {
    const report = await db.all(`
      SELECT 
        m.name,
        m.manufacturer,
        b.batch_number,
        i.current_stock,
        i.minimum_threshold,
        i.maximum_stock,
        (i.minimum_threshold - i.current_stock) as shortage,
        CASE 
          WHEN i.current_stock = 0 THEN 'OUT OF STOCK'
          WHEN i.current_stock <= i.minimum_threshold THEN 'LOW STOCK'
          ELSE 'NORMAL'
        END as status
      FROM inventory i
      JOIN medicines m ON i.medicine_id = m.id
      JOIN batches b ON i.batch_id = b.id
      WHERE i.current_stock <= i.minimum_threshold
      ORDER BY i.current_stock ASC
    `);

    const summary = {
      total_low_stock: report.length,
      out_of_stock: report.filter(r => r.status === 'OUT OF STOCK').length,
      low_stock: report.filter(r => r.status === 'LOW STOCK').length,
      total_shortage: report.reduce((sum, r) => sum + (r.shortage || 0), 0),
      generated_at: new Date().toISOString()
    };

    res.json({
      success: true,
      report_type: 'Low Stock Report',
      summary,
      data: report
    });
  } catch (error) {
    console.error('Error generating low stock report:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

/**
 * GET /api/reports/forecast
 * Generate stock forecast report
 */
router.get('/forecast', async (req, res) => {
  try {
    const report = await db.all(`
      SELECT 
        m.id,
        m.name,
        m.manufacturer,
        (SELECT SUM(quantity_dispensed) FROM dispensing_logs WHERE medicine_id = m.id AND dispensed_at > datetime('now', '-30 days')) as dispensed_30days,
        ROUND((SELECT SUM(quantity_dispensed) FROM dispensing_logs WHERE medicine_id = m.id AND dispensed_at > datetime('now', '-30 days')) / 30.0, 2) as avg_daily,
        (SELECT SUM(current_stock) FROM inventory WHERE medicine_id = m.id) as current_stock,
        CASE 
          WHEN (SELECT SUM(quantity_dispensed) FROM dispensing_logs WHERE medicine_id = m.id AND dispensed_at > datetime('now', '-30 days')) > 0 
          THEN ROUND((SELECT SUM(current_stock) FROM inventory WHERE medicine_id = m.id) / 
               ((SELECT SUM(quantity_dispensed) FROM dispensing_logs WHERE medicine_id = m.id AND dispensed_at > datetime('now', '-30 days')) / 30.0), 0)
          ELSE 999
        END as days_of_supply
      FROM medicines m
      WHERE m.is_active = 1
      ORDER BY days_of_supply ASC
    `);

    const summary = {
      total_medicines: report.length,
      critical_supply: report.filter(r => r.days_of_supply < 7).length,
      low_supply: report.filter(r => r.days_of_supply >= 7 && r.days_of_supply < 30).length,
      adequate_supply: report.filter(r => r.days_of_supply >= 30).length,
      generated_at: new Date().toISOString()
    };

    res.json({
      success: true,
      report_type: 'Stock Forecast Report',
      summary,
      data: report
    });
  } catch (error) {
    console.error('Error generating forecast report:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

/**
 * GET /api/reports/dispensing
 * Generate dispensing report for date range
 */
router.get('/dispensing', async (req, res) => {
  try {
    const startDate = req.query.start_date || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

    const report = await db.all(`
      SELECT 
        d.patient_name,
        d.patient_age,
        d.patient_gender,
        d.diagnosis,
        m.name as medicine_name,
        b.batch_number,
        d.quantity_dispensed,
        d.dispensed_at,
        u.name as healthcare_worker
      FROM dispensing_logs d
      JOIN medicines m ON d.medicine_id = m.id
      JOIN batches b ON d.batch_id = b.id
      JOIN users u ON d.user_id = u.id
      WHERE DATE(d.dispensed_at) BETWEEN ? AND ?
      ORDER BY d.dispensed_at DESC
    `, [startDate, endDate]);

    const summary = {
      total_dispensings: report.length,
      date_range: `${startDate} to ${endDate}`,
      total_patients: new Set(report.map(r => r.patient_name)).size,
      generated_at: new Date().toISOString()
    };

    res.json({
      success: true,
      report_type: 'Dispensing Report',
      summary,
      data: report
    });
  } catch (error) {
    console.error('Error generating dispensing report:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

module.exports = router;