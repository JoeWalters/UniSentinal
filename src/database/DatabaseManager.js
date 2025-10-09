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

        const createParentalControlsTable = `
            CREATE TABLE IF NOT EXISTS parental_controls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT UNIQUE NOT NULL,
                device_name TEXT NOT NULL,
                ip TEXT,
                vendor TEXT,
                is_blocked BOOLEAN DEFAULT 0,
                is_managed BOOLEAN DEFAULT 1,
                daily_time_limit INTEGER DEFAULT 0, -- minutes per day, 0 = no limit
                bonus_time INTEGER DEFAULT 0, -- additional minutes available
                time_used_today INTEGER DEFAULT 0, -- minutes used today
                last_reset_date TEXT, -- when time_used_today was last reset
                is_scheduled BOOLEAN DEFAULT 0,
                schedule_data TEXT, -- JSON string with schedule rules
                blocked_until TEXT, -- timestamp when temporary block expires
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createParentalLogsTable = `
            CREATE TABLE IF NOT EXISTS parental_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT NOT NULL,
                action TEXT NOT NULL, -- 'blocked', 'unblocked', 'time_added', 'schedule_changed'
                reason TEXT, -- 'manual', 'schedule', 'time_limit', 'temporary'
                duration INTEGER, -- for time-based actions
                admin_user TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        try {
            this.db.exec(createDevicesTable);console.log('Devices table ready');
            
            this.db.exec(createParentalControlsTable);
            console.log('Parental controls table ready');
            
            this.db.exec(createParentalLogsTable);
            console.log('Parental logs table ready');
        } catch (error) {
            console.error('Error creating database tables:', error);
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

    // Parental Controls Methods
    async addManagedDevice(deviceData) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO parental_controls 
                (mac, device_name, ip, vendor, is_managed, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);
            
            stmt.run(
                deviceData.mac,
                deviceData.device_name || deviceData.hostname || 'Unknown Device',
                deviceData.ip,
                deviceData.vendor
            );
            
            console.log(`Added device to parental controls: ${deviceData.mac}`);
        } catch (error) {
            console.error('Error adding managed device:', error);
            throw error;
        }
    }

    async getManagedDevices() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM parental_controls 
                WHERE is_managed = 1 
                ORDER BY device_name
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting managed devices:', error);
            throw error;
        }
    }

    async updateDeviceBlockStatus(mac, isBlocked, reason = 'manual', duration = null) {
        try {
            const stmt = this.db.prepare(`
                UPDATE parental_controls 
                SET is_blocked = ?, 
                    blocked_until = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE mac = ?
            `);
            
            let blockedUntil = null;
            if (isBlocked && duration) {
                const until = new Date();
                until.setMinutes(until.getMinutes() + duration);
                blockedUntil = until.toISOString();
            }
            
            stmt.run(isBlocked ? 1 : 0, blockedUntil, mac);
            
            // Log the action
            this.logParentalAction(mac, isBlocked ? 'blocked' : 'unblocked', reason, duration);
            
            console.log(`Device ${mac} ${isBlocked ? 'blocked' : 'unblocked'}`);
        } catch (error) {
            console.error('Error updating device block status:', error);
            throw error;
        }
    }

    async updateDeviceTimeLimit(mac, dailyTimeLimit, bonusTime = 0) {
        try {
            const stmt = this.db.prepare(`
                UPDATE parental_controls 
                SET daily_time_limit = ?, 
                    bonus_time = bonus_time + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE mac = ?
            `);
            
            stmt.run(dailyTimeLimit, bonusTime, mac);
            
            if (bonusTime > 0) {
                this.logParentalAction(mac, 'time_added', 'manual', bonusTime);
            }
            
            console.log(`Updated time limits for device ${mac}`);
        } catch (error) {
            console.error('Error updating device time limit:', error);
            throw error;
        }
    }

    async updateDeviceSchedule(mac, scheduleData) {
        try {
            const stmt = this.db.prepare(`
                UPDATE parental_controls 
                SET schedule_data = ?, 
                    is_scheduled = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE mac = ?
            `);
            
            const hasSchedule = scheduleData && Object.keys(scheduleData).length > 0;
            stmt.run(JSON.stringify(scheduleData), hasSchedule ? 1 : 0, mac);
            
            this.logParentalAction(mac, 'schedule_changed', 'manual');
            
            console.log(`Updated schedule for device ${mac}`);
        } catch (error) {
            console.error('Error updating device schedule:', error);
            throw error;
        }
    }

    async resetDailyTimeUsage() {
        try {
            const today = new Date().toDateString();
            const stmt = this.db.prepare(`
                UPDATE parental_controls 
                SET time_used_today = 0,
                    last_reset_date = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE last_reset_date != ? OR last_reset_date IS NULL
            `);
            
            const result = stmt.run(today, today);
            if (result.changes > 0) {
                console.log(`Reset daily time usage for ${result.changes} devices`);
            }
        } catch (error) {
            console.error('Error resetting daily time usage:', error);
            throw error;
        }
    }

    async removeManagedDevice(mac) {
        try {
            const stmt = this.db.prepare(`
                UPDATE parental_controls 
                SET is_managed = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE mac = ?
            `);
            
            stmt.run(mac);
            console.log(`Removed device from parental controls: ${mac}`);
        } catch (error) {
            console.error('Error removing managed device:', error);
            throw error;
        }
    }

    async logParentalAction(mac, action, reason, duration = null, adminUser = 'system') {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO parental_logs (mac, action, reason, duration, admin_user)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            stmt.run(mac, action, reason, duration, adminUser);
        } catch (error) {
            console.error('Error logging parental action:', error);
        }
    }

    async getParentalLogs(mac = null, limit = 100) {
        try {
            let query = `
                SELECT pl.*, pc.device_name
                FROM parental_logs pl
                LEFT JOIN parental_controls pc ON pl.mac = pc.mac
            `;
            
            if (mac) {
                query += ` WHERE pl.mac = ?`;
            }
            
            query += ` ORDER BY pl.timestamp DESC LIMIT ?`;
            
            const stmt = this.db.prepare(query);
            return mac ? stmt.all(mac, limit) : stmt.all(limit);
        } catch (error) {
            console.error('Error getting parental logs:', error);
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