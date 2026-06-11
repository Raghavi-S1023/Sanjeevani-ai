/**
 * Sanjeevani AI - Main Server File
 * Node.js + Express Backend Server
 * Handles all API routes and database operations
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./backend/database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('frontend'));

// Initialize Database
db.initializeDatabase();

// API Routes
app.use('/api/medicines', require('./backend/routes/medicines'));
app.use('/api/inventory', require('./backend/routes/inventory'));
app.use('/api/dispensing', require('./backend/routes/dispensing'));
app.use('/api/reports', require('./backend/routes/reports'));
app.use('/api/users', require('./backend/routes/users'));
app.use('/api/predictions', require('./backend/routes/predictions'));
app.use('/api/audit', require('./backend/routes/audit'));
app.use('/api/notifications', require('./backend/routes/notifications'));

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
});

app.get('/medicines', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'medicines.html'));
});

app.get('/scanner', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'scanner.html'));
});

app.get('/dispense', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dispense.html'));
});

app.get('/reports', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'reports.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🏥 Sanjeevani AI Server running on http://localhost:${PORT}`);
  console.log('📱 Open your browser and navigate to http://localhost:3000');
  console.log('🔗 API Documentation available in backend/routes/\n');
});

module.exports = app;
