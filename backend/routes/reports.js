/**
 * Reports API Routes
 * Generate various reports (Expired, Low Stock, Monthly Dispensing)
 */

const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../database/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/reports/expired - Get expired medicines report
 */
router.get('/expired', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const expiredMedicines = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND expiry_date < ?
      ORDER BY expiry_date ASC
    `, [today]);

    res.json({
      total_expired: expiredMedicines.length,
      medicines: expiredMedicines,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/low-stock - Get low stock medicines report
 */
router.get('/low-stock', async (req, res) => {
  try {
    const lowStockMedicines = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND quantity < 10
      ORDER BY quantity ASC
    `);

    res.json({
      total_low_stock: lowStockMedicines.length,
      medicines: lowStockMedicines,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/monthly-dispensing - Get monthly dispensing report
 */
router.get('/monthly-dispensing', async (req, res) => {
  try {
    const monthlyData = await dbAll(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        m.medicine_name,
        SUM(quantity_dispensed) as total_dispensed,
        COUNT(*) as transaction_count,
        AVG(dl.quantity_dispensed) as avg_dispensed
      FROM dispensing_logs dl
      LEFT JOIN medicines m ON dl.medicine_id = m.id
      GROUP BY month, medicine_id
      ORDER BY month DESC
    `);

    res.json({
      monthly_data: monthlyData,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/pdf/expired - Download expired medicines as PDF
 */
router.get('/pdf/expired', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const expiredMedicines = await dbAll(`
      SELECT * FROM medicines WHERE is_active = 1 AND expiry_date < ?
    `, [today]);

    const doc = new PDFDocument();
    const filename = `expired-medicines-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);
    doc.fontSize(20).text('Expired Medicines Report', 100, 100);
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, 100, 130);
    
    let yPosition = 170;
    expiredMedicines.forEach((medicine, index) => {
      doc.fontSize(11).
        text(`${index + 1}. ${medicine.medicine_name}`, 100, yPosition).
        text(`   Batch: ${medicine.batch_number} | Expired: ${medicine.expiry_date}`, 120, yPosition + 15).
        text(`   Manufacturer: ${medicine.manufacturer}`, 120, yPosition + 30);
      yPosition += 60;
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/dashboard - Get comprehensive dashboard report
 */
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const overview = await dbGet(`
      SELECT 
        COUNT(*) as total_medicines,
        SUM(quantity) as total_quantity
      FROM medicines WHERE is_active = 1
    `);

    const expiredCount = await dbGet(`
      SELECT COUNT(*) as count FROM medicines WHERE is_active = 1 AND expiry_date < ?
    `, [today]);

    const expiringCount = await dbGet(`
      SELECT COUNT(*) as count FROM medicines WHERE is_active = 1 AND expiry_date BETWEEN ? AND ?
    `, [today, thirtyDaysLater]);

    const lowStockCount = await dbGet(`
      SELECT COUNT(*) as count FROM medicines WHERE is_active = 1 AND quantity < 10
    `);

    const totalDispensed = await dbGet(`
      SELECT SUM(quantity_dispensed) as total FROM dispensing_logs WHERE created_at >= date('now', '-30 days')
    `);

    res.json({
      overview: {
        total_medicines: overview?.total_medicines || 0,
        total_quantity: overview?.total_quantity || 0
      },
      alerts: {
        expired_medicines: expiredCount?.count || 0,
        expiring_soon: expiringCount?.count || 0,
        low_stock: lowStockCount?.count || 0
      },
      dispensing: {
        last_30_days: totalDispensed?.total || 0
      },
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
