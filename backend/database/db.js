/**
 * Database Configuration and Initialization
 * SQLite3 for offline-friendly data storage
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'sanjeevani.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

/**
 * Initialize Database - Create tables if they don't exist
 */
function initializeDatabase() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'pharmacist', 'health_worker')) NOT NULL,
      facility_name TEXT,
      phone TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Medicines table
  db.run(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_name TEXT NOT NULL,
      batch_number TEXT UNIQUE NOT NULL,
      manufacturer TEXT NOT NULL,
      manufacturing_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT DEFAULT 'tablets',
      storage_condition TEXT,
      supplier TEXT,
      price_per_unit REAL,
      barcode TEXT UNIQUE,
      qr_code TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inventory Transactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      transaction_type TEXT CHECK(transaction_type IN ('add', 'edit', 'delete')) NOT NULL,
      quantity_before INTEGER,
      quantity_after INTEGER,
      reason TEXT,
      performed_by_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (performed_by_id) REFERENCES users(id)
    )
  `);

  // Dispensing Logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS dispensing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      quantity_dispensed INTEGER NOT NULL,
      dispensed_by_id INTEGER NOT NULL,
      patient_name TEXT,
      patient_age INTEGER,
      patient_phone TEXT,
      dispensing_notes TEXT,
      is_verified BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (dispensed_by_id) REFERENCES users(id)
    )
  `);

  // Audit Logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      performed_by_id INTEGER,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (performed_by_id) REFERENCES users(id)
    )
  `);

  // Notifications table
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      notification_type TEXT CHECK(notification_type IN ('expiry', 'low_stock', 'stockout', 'alert')) NOT NULL,
      medicine_id INTEGER,
      severity TEXT CHECK(severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
      is_read BOOLEAN DEFAULT 0,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Stock Predictions table
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      current_quantity INTEGER,
      average_daily_consumption REAL,
      estimated_stockout_date DATE,
      days_until_stockout INTEGER,
      recommendation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    )
  `);

  console.log('✅ Database tables initialized');
}

/**
 * Promise wrapper for database queries
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  db,
  initializeDatabase,
  dbRun,
  dbGet,
  dbAll
};
