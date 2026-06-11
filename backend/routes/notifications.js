/**
 * Notifications API Routes
 * Handle alerts and notifications
 */

const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database/db');

/**
 * GET /api/notifications - Get all notifications
 */
router.get('/', async (req, res) => {
  try {
    const notifications = await dbAll(`
      SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50
    `);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/notifications/unread - Get unread notifications
 */
router.get('/unread', async (req, res) => {
  try {
    const notifications = await dbAll(`
      SELECT * FROM notifications WHERE is_read = 0
      ORDER BY created_at DESC
    `);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/notifications/:id/read - Mark notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    await dbRun(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/notifications/:id - Delete notification
 */
router.delete('/:id', async (req, res) => {
  try {
    await dbRun(`DELETE FROM notifications WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
