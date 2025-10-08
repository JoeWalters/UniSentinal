const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
    constructor() {
        const configDir = process.env.CONFIG_DIR || '/config';
        this.dbPath = process.env.DB_PATH || path.join(configDir, 'devices.db');
        this.db = null;
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const fs = require('fs');
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new Database(this.dbPath);
            console.log('Connected to SQLite database');
            await this.createTables();
        } catch (error) {
            console.error('Error opening database:', error);
            throw error;
        }
    }

    async createTables() {
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

        try {
            this.db.exec(createDevicesTable);
            console.log('Devices table ready');
        } catch (error) {
            console.error('Error creating devices table:', error);
            throw error;
        }
    }

    async addNewDevices(devices) {
        if (!devices || devices.length === 0) return;

        const insertDevice = this.db.prepare(`
            INSERT OR IGNORE INTO devices (
                mac, ip, hostname, vendor, first_seen, last_seen,
                is_wired, ap_mac, network, signal, tx_bytes, rx_bytes, detected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const transaction = this.db.transaction((devices) => {
                for (const device of devices) {
                    insertDevice.run(
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
                    );
                }
            });

            transaction(devices);
            console.log(`Added ${devices.length} new device(s) to database`);
        } catch (error) {
            console.error('Error adding devices:', error);
            throw error;
        }
    }

    async getUnacknowledgedDevices() {
        try {
            const query = `
                SELECT * FROM devices 
                WHERE acknowledged = 0 
                ORDER BY detected_at DESC
            `;

            const rows = this.db.prepare(query).all();
            
            // Convert boolean values back from integers
            const devices = rows.map(row => ({
                ...row,
                is_wired: Boolean(row.is_wired),
                acknowledged: Boolean(row.acknowledged)
            }));
            
            return devices;
        } catch (error) {
            console.error('Error getting unacknowledged devices:', error);
            throw error;
        }
    }

    async acknowledgeDevice(mac) {
        try {
            const query = `
                UPDATE devices 
                SET acknowledged = 1, acknowledged_at = ? 
                WHERE mac = ?
            `;

            const result = this.db.prepare(query).run(new Date().toISOString(), mac);
            
            if (result.changes === 0) {
                throw new Error('Device not found');
            }
            
            console.log(`Device ${mac} acknowledged`);
        } catch (error) {
            console.error('Error acknowledging device:', error);
            throw error;
        }
    }

    async getAllDevices() {
        try {
            const query = `
                SELECT * FROM devices 
                ORDER BY detected_at DESC
            `;

            const rows = this.db.prepare(query).all();
            
            const devices = rows.map(row => ({
                ...row,
                is_wired: Boolean(row.is_wired),
                acknowledged: Boolean(row.acknowledged)
            }));
            
            return devices;
        } catch (error) {
            console.error('Error getting all devices:', error);
            throw error;
        }
    }

    async getDeviceStats() {
        try {
            const queries = {
                total: 'SELECT COUNT(*) as count FROM devices',
                unacknowledged: 'SELECT COUNT(*) as count FROM devices WHERE acknowledged = 0',
                acknowledged: 'SELECT COUNT(*) as count FROM devices WHERE acknowledged = 1',
                today: `SELECT COUNT(*) as count FROM devices WHERE date(detected_at) = date('now')`
            };

            const stats = {};
            
            for (const [key, query] of Object.entries(queries)) {
                const row = this.db.prepare(query).get();
                stats[key] = row.count;
            }
            
            return stats;
        } catch (error) {
            console.error('Error getting device stats:', error);
            throw error;
        }
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('Database connection closed');
            } catch (error) {
                console.error('Error closing database:', error);
            }
        }
    }
}

module.exports = DatabaseManager;