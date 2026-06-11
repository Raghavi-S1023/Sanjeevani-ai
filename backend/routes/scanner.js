/**
 * Scanner API Routes
 * Endpoints for OCR, barcode, and QR code scanning
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../utils/database');
const Tesseract = require('tesseract.js');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

/**
 * POST /api/scanner/ocr
 * Scan medicine using OCR
 * Form data: { user_id, image }
 */
router.post('/ocr', upload.single('image'), async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id || !req.file) {
      return res.status(400).json({ error: 'Missing required fields: user_id, image' });
    }

    console.log('🔍 Starting OCR scan...');

    // Perform OCR using Tesseract.js
    const result = await Tesseract.recognize(
      req.file.path,
      'eng',
      {
        logger: m => console.log('OCR Progress:', m)
      }
    );

    const extractedText = result.data.text;
    console.log('📝 Extracted Text:', extractedText);

    // Parse extracted text to find medicine details
    const medicinePattern = /([A-Za-z\s]+?)[\n,].*?(\d{2}\/\d{2}\/\d{4})?.*?(\w+-\d{4}-\d{3,6})?/i;
    const expiryPattern = /(\d{2}\/\d{2}\/\d{4})/;
    const batchPattern = /([A-Z]+-\d{4}-\d{3,6})/;

    const medicines = await db.all('SELECT * FROM medicines WHERE is_active = 1');
    let matchedMedicine = null;
    let confidenceScore = 0;

    // Try to match extracted text with medicines in database
    for (const med of medicines) {
      if (extractedText.toLowerCase().includes(med.name.toLowerCase())) {
        matchedMedicine = med;
        confidenceScore = 95;
        break;
      }
    }

    // Extract dates and batch number
    const expiryMatch = extractedText.match(expiryPattern);
    const batchMatch = extractedText.match(batchPattern);

    const scannedData = {
      extracted_medicine_name: extractedText.split('\n')[0] || 'Unknown',
      extracted_batch_number: batchMatch ? batchMatch[0] : 'Unknown',
      extracted_expiry_date: expiryMatch ? expiryMatch[0] : null,
      confidence_score: matchedMedicine ? 95 : 60,
      matched_medicine_id: matchedMedicine ? matchedMedicine.id : null,
      raw_text: extractedText
    };

    // Save scan to database
    const scanResult = await db.run(
      `INSERT INTO ocr_scans (user_id, image_path, extracted_medicine_name, extracted_batch_number, extracted_expiry_date, confidence_score, matched_medicine_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        req.file.path,
        scannedData.extracted_medicine_name,
        scannedData.extracted_batch_number,
        scannedData.extracted_expiry_date,
        scannedData.confidence_score,
        scannedData.matched_medicine_id
      ]
    );

    res.json({
      success: true,
      message: 'OCR scan completed',
      data: {
        scan_id: scanResult.lastID,
        ...scannedData,
        matched_medicine: matchedMedicine
      }
    });
  } catch (error) {
    console.error('Error during OCR scan:', error);
    res.status(500).json({ error: 'OCR scan failed', details: error.message });
  }
});

/**
 * POST /api/scanner/barcode
 * Scan barcode (simulated - in real app would use barcode library)
 * Body: { user_id, barcode_data }
 */
router.post('/barcode', async (req, res) => {
  try {
    const { user_id, barcode_data } = req.body;

    if (!user_id || !barcode_data) {
      return res.status(400).json({ error: 'Missing required fields: user_id, barcode_data' });
    }

    // Search for medicine with matching barcode
    const medicine = await db.get(
      'SELECT * FROM medicines WHERE name LIKE ?',
      [`%${barcode_data}%`]
    );

    res.json({
      success: true,
      message: 'Barcode scanned',
      data: {
        barcode: barcode_data,
        medicine: medicine || null
      }
    });
  } catch (error) {
    console.error('Error scanning barcode:', error);
    res.status(500).json({ error: 'Barcode scan failed', details: error.message });
  }
});

/**
 * GET /api/scanner/history
 * Get scanning history for a user
 */
router.get('/history', async (req, res) => {
  try {
    const { user_id, limit = 20, page = 1 } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const offset = (page - 1) * limit;

    const history = await db.all(`
      SELECT 
        o.*,
        m.name as medicine_name
      FROM ocr_scans o
      LEFT JOIN medicines m ON o.matched_medicine_id = m.id
      WHERE o.user_id = ?
      ORDER BY o.scanned_at DESC
      LIMIT ? OFFSET ?
    `, [user_id, limit, offset]);

    res.json({
      success: true,
      data: history,
      pagination: { page, limit }
    });
  } catch (error) {
    console.error('Error fetching scan history:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

module.exports = router;