const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseManager {
    constructor() {
        this.dbPath = process.env.DB_PATH || './data/devices.db';
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            // Ensure data directory exists
            const fs = require('fs');
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const createDevicesTable = `
                CREATE TABLE IF NOT EXISTS devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mac TEXT UNIQUE NOT NULL,
                    ip TEXT,
                    hostname TEXT,
                    vendor TEXT,
                    first_seen TEXT,
                    last_seen TEXT,
                    is_wired BOOLEAN DEFAULT 0,
                    ap_mac TEXT,
                    network TEXT,
                    signal INTEGER,
                    tx_bytes INTEGER DEFAULT 0,
                    rx_bytes INTEGER DEFAULT 0,
                    detected_at TEXT NOT NULL,
                    acknowledged BOOLEAN DEFAULT 0,
                    acknowledged_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.run(createDevicesTable, (err) => {
                if (err) {
                    console.error('Error creating devices table:', err);
                    reject(err);
                } else {
                    console.log('Devices table ready');
                    resolve();
                }
            });
        });
    }

    async addNewDevices(devices) {
        if (!devices || devices.length === 0) return;

        const insertDevice = `
            INSERT OR IGNORE INTO devices (
                mac, ip, hostname, vendor, first_seen, last_seen,
                is_wired, ap_mac, network, signal, tx_bytes, rx_bytes, detected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                const stmt = this.db.prepare(insertDevice);
                
                devices.forEach(device => {
                    stmt.run([
                        device.mac,
                        device.ip,
                        device.hostname,
                        device.vendor,
                        device.first_seen,
                        device.last_seen,
                        device.is_wired ? 1 : 0,
                        device.ap_mac,
                        device.network,
                        device.signal,
                        device.tx_bytes,
                        device.rx_bytes,
                        new Date().toISOString()
                    ]);
                });
                
                stmt.finalize((err) => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                    } else {
                        this.db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                reject(commitErr);
                            } else {
                                console.log(`Added ${devices.length} new device(s) to database`);
                                resolve();
                            }
                        });
                    }
                });
            });
        });
    }

    async getUnacknowledgedDevices() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM devices 
                WHERE acknowledged = 0 
                ORDER BY detected_at DESC
            `;

            this.db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Convert boolean values back from integers
                    const devices = rows.map(row => ({
                        ...row,
                        is_wired: Boolean(row.is_wired),
                        acknowledged: Boolean(row.acknowledged)
                    }));
                    resolve(devices);
                }
            });
        });
    }

    async acknowledgeDevice(mac) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE devices 
                SET acknowledged = 1, acknowledged_at = ? 
                WHERE mac = ?
            `;

            this.db.run(query, [new Date().toISOString(), mac], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Device not found'));
                } else {
                    console.log(`Device ${mac} acknowledged`);
                    resolve();
                }
            });
        });
    }

    async getAllDevices() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM devices 
                ORDER BY detected_at DESC
            `;

            this.db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const devices = rows.map(row => ({
                        ...row,
                        is_wired: Boolean(row.is_wired),
                        acknowledged: Boolean(row.acknowledged)
                    }));
                    resolve(devices);
                }
            });
        });
    }

    async getDeviceStats() {
        return new Promise((resolve, reject) => {
            const queries = {
                total: 'SELECT COUNT(*) as count FROM devices',
                unacknowledged: 'SELECT COUNT(*) as count FROM devices WHERE acknowledged = 0',
                acknowledged: 'SELECT COUNT(*) as count FROM devices WHERE acknowledged = 1',
                today: `SELECT COUNT(*) as count FROM devices WHERE date(detected_at) = date('now')`
            };

            const stats = {};
            let completed = 0;
            const total = Object.keys(queries).length;

            Object.entries(queries).forEach(([key, query]) => {
                this.db.get(query, (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stats[key] = row.count;
                    completed++;
                    
                    if (completed === total) {
                        resolve(stats);
                    }
                });
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = DatabaseManager;