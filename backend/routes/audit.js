/**
 * Audit Logs API Routes
 * Track all user actions for compliance
 */

const express = require('express');
const router = express.Router();
const { dbAll, dbGet } = require('../database/db');

/**
 * GET /api/audit/logs - Get all audit logs
 */
router.get('/logs', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT al.*, u.full_name FROM audit_logs al
      LEFT JOIN users u ON al.performed_by_id = u.id
      ORDER BY al.created_at DESC LIMIT 1000
    `);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/logs/:userId - Get audit logs for specific user
 */
router.get('/logs/:userId', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT * FROM audit_logs WHERE performed_by_id = ?
      ORDER BY created_at DESC
    `, [req.params.userId]);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/entity/:entityType/:entityId - Get audit logs for specific entity
 */
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT al.*, u.full_name FROM audit_logs al
      LEFT JOIN users u ON al.performed_by_id = u.id
      WHERE al.entity_type = ? AND al.entity_id = ?
      ORDER BY al.created_at DESC
    `, [req.params.entityType, req.params.entityId]);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
