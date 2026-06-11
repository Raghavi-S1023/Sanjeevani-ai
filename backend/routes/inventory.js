/**
 * Inventory API Routes
 * Endpoints for managing medicine inventory and batches
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');

/**
 * GET /api/inventory
 * Get complete inventory with low stock alerts
 */
router.get('/', async (req, res) => {
  try {
    const inventory = await db.all(`
      SELECT 
        i.*,
        m.name as medicine_name,
        m.manufacturer,
        b.batch_number,
        b.expiry_date,
        CASE 
          WHEN b.expiry_date < date('now') THEN 'expired'
          WHEN b.expiry_date < date('now', '+7 days') THEN 'expiring_soon'
          WHEN b.expiry_date < date('now', '+30 days') THEN 'expiring_in_30'
          ELSE 'valid'
        END as expiry_status,
        CASE
          WHEN i.current_stock <= i.minimum_threshold THEN 'low'
          WHEN i.current_stock >= i.maximum_stock THEN 'high'
          ELSE 'normal'
        END as stock_status
      FROM inventory i
      JOIN medicines m ON i.medicine_id = m.id
      JOIN batches b ON i.batch_id = b.id
      WHERE m.is_active = 1
      ORDER BY i.updated_at DESC
    `);

    // Calculate statistics
    const stats = {
      total_medicines: 0,
      low_stock_count: 0,
      expired_count: 0,
      expiring_soon_count: 0
    };

    inventory.forEach(item => {
      if (item.stock_status === 'low') stats.low_stock_count++;
      if (item.expiry_status === 'expired') stats.expired_count++;
      if (item.expiry_status === 'expiring_soon') stats.expiring_soon_count++;
    });

    stats.total_medicines = inventory.length;

    res.json({
      success: true,
      data: inventory,
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory', details: error.message });
  }
});

/**
 * GET /api/inventory/low-stock
 * Get medicines with low stock levels
 */
router.get('/alerts/low-stock', async (req, res) => {
  try {
    const lowStock = await db.all(`
      SELECT 
        i.*,
        m.name as medicine_name,
        m.manufacturer,
        b.batch_number,
        (i.minimum_threshold - i.current_stock) as shortage_units
      FROM inventory i
      JOIN medicines m ON i.medicine_id = m.id
      JOIN batches b ON i.batch_id = b.id
      WHERE i.current_stock <= i.minimum_threshold
      AND m.is_active = 1
      ORDER BY i.current_stock ASC
    `);

    res.json({
      success: true,
      data: lowStock,
      count: lowStock.length
    });
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items', details: error.message });
  }
});

/**
 * POST /api/inventory/batch
 * Add new medicine batch to inventory
 * Body: { medicine_id, batch_number, manufacturer_name, manufacturing_date, expiry_date, quantity_received, supplier_name, cost_per_unit }
 */
router.post('/batch', async (req, res) => {
  try {
    const {
      medicine_id,
      batch_number,
      manufacturer_name,
      manufacturing_date,
      expiry_date,
      quantity_received,
      supplier_name,
      cost_per_unit
    } = req.body;

    // Validate required fields
    if (!medicine_id || !batch_number || !manufacturer_name || !expiry_date || !quantity_received) {
      return res.status(400).json({
        error: 'Missing required fields: medicine_id, batch_number, manufacturer_name, expiry_date, quantity_received'
      });
    }

    // Check if medicine exists
    const medicine = await db.get('SELECT * FROM medicines WHERE id = ?', [medicine_id]);
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    // Check if batch already exists
    const existingBatch = await db.get('SELECT * FROM batches WHERE batch_number = ?', [batch_number]);
    if (existingBatch) {
      return res.status(400).json({ error: 'Batch number already exists' });
    }

    // Create batch
    const batchResult = await db.run(
      `INSERT INTO batches (medicine_id, batch_number, manufacturer_name, manufacturing_date, expiry_date, quantity_received, quantity_remaining, supplier_name, cost_per_unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [medicine_id, batch_number, manufacturer_name, manufacturing_date, expiry_date, quantity_received, quantity_received, supplier_name || null, cost_per_unit || null]
    );

    // Create inventory entry
    const invResult = await db.run(
      `INSERT INTO inventory (medicine_id, batch_id, current_stock, minimum_threshold, maximum_stock)
       VALUES (?, ?, ?, ?, ?)`,
      [medicine_id, batchResult.lastID, quantity_received, 10, 1000]
    );

    const batch = await db.get('SELECT * FROM batches WHERE id = ?', [batchResult.lastID]);

    res.status(201).json({
      success: true,
      message: 'Batch added successfully',
      data: batch
    });
  } catch (error) {
    console.error('Error adding batch:', error);
    res.status(500).json({ error: 'Failed to add batch', details: error.message });
  }
});

/**
 * PUT /api/inventory/:id
 * Update inventory stock level
 * Body: { current_stock, minimum_threshold, location_in_clinic }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_stock, minimum_threshold, location_in_clinic } = req.body;

    // Check if inventory exists
    const inventory = await db.get('SELECT * FROM inventory WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Update inventory
    await db.run(
      `UPDATE inventory SET 
       current_stock = COALESCE(?, current_stock),
       minimum_threshold = COALESCE(?, minimum_threshold),
       location_in_clinic = COALESCE(?, location_in_clinic),
       last_counted = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [current_stock, minimum_threshold, location_in_clinic, id]
    );

    const updatedInventory = await db.get(
      `SELECT i.*, m.name as medicine_name, b.batch_number FROM inventory i
       JOIN medicines m ON i.medicine_id = m.id
       JOIN batches b ON i.batch_id = b.id
       WHERE i.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: updatedInventory
    });
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ error: 'Failed to update inventory', details: error.message });
  }
});

/**
 * GET /api/inventory/expired
 * Get all expired medicines
 */
router.get('/alerts/expired', async (req, res) => {
  try {
    const expired = await db.all(`
      SELECT 
        i.*,
        m.name as medicine_name,
        m.manufacturer,
        b.batch_number,
        b.expiry_date,
        CAST((julianday('now') - julianday(b.expiry_date)) AS INTEGER) as days_expired
      FROM inventory i
      JOIN medicines m ON i.medicine_id = m.id
      JOIN batches b ON i.batch_id = b.id
      WHERE b.expiry_date < date('now')
      AND m.is_active = 1
      ORDER BY b.expiry_date ASC
    `);

    res.json({
      success: true,
      data: expired,
      count: expired.length
    });
  } catch (error) {
    console.error('Error fetching expired medicines:', error);
    res.status(500).json({ error: 'Failed to fetch expired medicines', details: error.message });
  }
});

module.exports = router;
