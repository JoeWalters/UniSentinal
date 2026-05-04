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
                name TEXT,
                ip TEXT,
                hostname TEXT,
                vendor TEXT,
                first_seen TEXT,
                last_seen TEXT,
                is_online BOOLEAN DEFAULT 0,
                is_blocked BOOLEAN DEFAULT 0,
                device_type TEXT,
                os_name TEXT,
                note TEXT,
                uptime INTEGER,
                is_wired BOOLEAN DEFAULT 0,
                ap_mac TEXT,
                network TEXT,
                signal INTEGER,
                tx_bytes INTEGER DEFAULT 0,
                rx_bytes INTEGER DEFAULT 0,
                detected_at TEXT NOT NULL,
                acknowledged BOOLEAN DEFAULT 0,
                acknowledged_at TEXT,
                watch_connection BOOLEAN DEFAULT 0,
                watch_last_alerted_at TEXT,
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

        const createConnectionEventsTable = `
            CREATE TABLE IF NOT EXISTS connection_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT NOT NULL,
                event_type TEXT NOT NULL, -- 'connected', 'disconnected'
                ip TEXT,
                ap_mac TEXT,
                signal INTEGER,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        try {
            this.db.exec(createDevicesTable);console.log('Devices table ready');
            
            this.db.exec(createParentalControlsTable);
            console.log('Parental controls table ready');
            
            this.db.exec(createParentalLogsTable);
            console.log('Parental logs table ready');

            this.db.exec(createConnectionEventsTable);
            console.log('Connection events table ready');
            
            // Migrate existing schema to add new columns
            await this.migrateSchema();
        } catch (error) {
            console.error('Error creating database tables:', error);
            throw error;
        }
    }

    async migrateSchema() {
        try {
            // Get current table schema
            const columns = this.db.prepare("PRAGMA table_info(devices)").all();
            const columnNames = columns.map(col => col.name);
            
            // Add missing columns to devices table
            const newColumns = [
                { name: 'name', type: 'TEXT' },
                { name: 'is_online', type: 'BOOLEAN DEFAULT 0' },
                { name: 'is_blocked', type: 'BOOLEAN DEFAULT 0' },
                { name: 'device_type', type: 'TEXT' },
                { name: 'os_name', type: 'TEXT' },
                { name: 'note', type: 'TEXT' },
                { name: 'uptime', type: 'INTEGER' },
                { name: 'watch_connection', type: 'BOOLEAN DEFAULT 0' },
                { name: 'watch_last_alerted_at', type: 'TEXT' }
            ];
            
            for (const column of newColumns) {
                if (!columnNames.includes(column.name)) {
                    console.log(`Adding column '${column.name}' to devices table`);
                    this.db.exec(`ALTER TABLE devices ADD COLUMN ${column.name} ${column.type}`);
                }
            }

            // New columns for naming/tagging (Feature 8)
            const deviceNewCols = [
                { name: 'custom_name', type: 'TEXT' },
                { name: 'tags', type: 'TEXT' },
                { name: 'watch_offline', type: 'BOOLEAN DEFAULT 0' }
            ];
            for (const column of deviceNewCols) {
                if (!columnNames.includes(column.name)) {
                    console.log(`Adding column '${column.name}' to devices table`);
                    this.db.exec(`ALTER TABLE devices ADD COLUMN ${column.name} ${column.type}`);
                }
            }
        } catch (error) {
            console.error('Error migrating schema:', error);
            // Don't throw - continue with existing schema if migration fails
        }
    }

    async addNewDevices(devices) {
        if (!devices || devices.length === 0) return;

        // Use INSERT OR IGNORE to avoid overwriting existing rows, then UPDATE
        // only the mutable fields — this preserves acknowledged / acknowledged_at.
        const insertDevice = this.db.prepare(`
            INSERT OR IGNORE INTO devices (
                mac, name, ip, hostname, vendor, first_seen, last_seen,
                is_online, is_blocked, device_type, os_name, note, uptime,
                is_wired, ap_mac, network, signal, tx_bytes, rx_bytes, detected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateDevice = this.db.prepare(`
            UPDATE devices SET
                name = ?, ip = ?, hostname = ?, vendor = ?, last_seen = ?,
                is_online = ?, is_blocked = ?, device_type = ?, os_name = ?,
                uptime = ?, is_wired = ?, ap_mac = ?, network = ?,
                signal = ?, tx_bytes = ?, rx_bytes = ?
            WHERE mac = ?
        `);

        try {
            const transaction = this.db.transaction((devices) => {
                for (const device of devices) {
                    const now = new Date().toISOString();
                    insertDevice.run(
                        device.mac,
                        device.name || null,
                        device.ip,
                        device.hostname,
                        device.vendor,
                        device.first_seen,
                        device.last_seen,
                        device.is_online ? 1 : 0,
                        device.is_blocked ? 1 : 0,
                        device.device_type,
                        device.os_name,
                        device.note,
                        device.uptime,
                        device.is_wired ? 1 : 0,
                        device.ap_mac,
                        device.network,
                        device.signal,
                        device.tx_bytes,
                        device.rx_bytes,
                        now
                    );
                    updateDevice.run(
                        device.name || null,
                        device.ip,
                        device.hostname,
                        device.vendor,
                        device.last_seen,
                        device.is_online ? 1 : 0,
                        device.is_blocked ? 1 : 0,
                        device.device_type,
                        device.os_name,
                        device.uptime,
                        device.is_wired ? 1 : 0,
                        device.ap_mac,
                        device.network,
                        device.signal,
                        device.tx_bytes,
                        device.rx_bytes,
                        device.mac
                    );
                }
            });

            transaction(devices);
            console.log(`Added ${devices.length} new device(s) to database`);

            // Re-alert watched devices that have reconnected since the last alert
            this._checkWatchAlerts(devices);

            this._recordConnectionEvents(devices);
        } catch (error) {
            console.error('Error adding devices:', error);
            throw error;
        }
    }

    _recordConnectionEvents(scannedDevices) {
        try {
            const insertEvent = this.db.prepare(
                `INSERT INTO connection_events (mac, event_type, ip, ap_mac, signal)
                 SELECT ?, 'connected', ?, ?, ?
                 WHERE NOT EXISTS (
                     SELECT 1 FROM connection_events
                     WHERE mac = ? AND event_type = 'connected'
                     AND timestamp >= datetime('now', '-2 minutes')
                 )`
            );

            for (const d of scannedDevices) {
                if (d.is_online) {
                    insertEvent.run(d.mac, d.ip || null, d.ap_mac || null,
                        d.signal || null, d.mac);
                }
            }
        } catch (error) {
            console.error('Error recording connection events:', error);
        }
    }

    _checkWatchAlerts(scannedDevices) {
        try {
            const watched = this.db.prepare(
                `SELECT mac, watch_last_alerted_at FROM devices WHERE watch_connection = 1 AND acknowledged = 1`
            ).all();

            if (watched.length === 0) return;

            const devicesByMac = {};
            for (const d of scannedDevices) devicesByMac[d.mac] = d;

            const now = Date.now();
            const alertStmt = this.db.prepare(
                `UPDATE devices SET acknowledged = 0, watch_last_alerted_at = ? WHERE mac = ?`
            );

            for (const dbDevice of watched) {
                const scanDevice = devicesByMac[dbDevice.mac];
                if (!scanDevice || !scanDevice.is_online) continue;

                const uptimeMs = (scanDevice.uptime || 0) * 1000;
                let shouldAlert = false;

                if (!dbDevice.watch_last_alerted_at) {
                    shouldAlert = true; // No previous alert recorded
                } else {
                    const timeSinceAlertMs = now - new Date(dbDevice.watch_last_alerted_at).getTime();
                    // Alert if device reconnected after last alert (uptime restarted)
                    shouldAlert = timeSinceAlertMs > uptimeMs;
                }

                if (shouldAlert) {
                    alertStmt.run(new Date(now).toISOString(), dbDevice.mac);
                    console.log(`Watch alert triggered for device: ${dbDevice.mac}`);
                }
            }
        } catch (error) {
            console.error('Error checking watch alerts:', error);
            // Don't throw - watch alerts are non-critical
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
                acknowledged: Boolean(row.acknowledged),
                watch_connection: Boolean(row.watch_connection)
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

    async forgetDevice(mac) {
        try {
            const result = this.db.prepare(
                `UPDATE devices SET acknowledged = 0, acknowledged_at = NULL WHERE mac = ?`
            ).run(mac);
            if (result.changes === 0) throw new Error('Device not found');
            console.log(`Device ${mac} forgotten (unacknowledged)`);
        } catch (error) {
            console.error('Error forgetting device:', error);
            throw error;
        }
    }

    async setWatchConnection(mac, watch) {
        try {
            const result = this.db.prepare(
                `UPDATE devices SET watch_connection = ? WHERE mac = ?`
            ).run(watch ? 1 : 0, mac);
            if (result.changes === 0) throw new Error('Device not found');
            console.log(`Device ${mac} watch_connection set to ${watch}`);
        } catch (error) {
            console.error('Error setting watch connection:', error);
            throw error;
        }
    }

    async getAcknowledgedDevices() {
        try {
            const rows = this.db.prepare(
                `SELECT * FROM devices WHERE acknowledged = 1 ORDER BY acknowledged_at DESC`
            ).all();
            return rows.map(row => ({
                ...row,
                is_wired: Boolean(row.is_wired),
                acknowledged: Boolean(row.acknowledged),
                watch_connection: Boolean(row.watch_connection)
            }));
        } catch (error) {
            console.error('Error getting acknowledged devices:', error);
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

    async getManagedDevice(mac) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM parental_controls 
                WHERE mac = ? AND is_managed = 1
            `);
            return stmt.get(mac);
        } catch (error) {
            console.error('Error getting managed device:', error);
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

    // ── Device naming / tagging (Feature 8) ─────────────────────────

    async updateDeviceMeta(mac, { custom_name, tags, note, watch_connection, watch_offline }) {
        try {
            const fields = [];
            const values = [];
            if (custom_name !== undefined) { fields.push('custom_name = ?'); values.push(custom_name || null); }
            if (tags !== undefined) { fields.push('tags = ?'); values.push(tags || null); }
            if (note !== undefined) { fields.push('note = ?'); values.push(note || null); }
            if (watch_connection !== undefined) { fields.push('watch_connection = ?'); values.push(watch_connection ? 1 : 0); }
            if (watch_offline !== undefined) { fields.push('watch_offline = ?'); values.push(watch_offline ? 1 : 0); }
            if (fields.length === 0) return;
            values.push(mac);
            this.db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE mac = ?`).run(...values);
        } catch (error) {
            console.error('Error updating device meta:', error);
            throw error;
        }
    }

    // ── Device connection history (Feature 7) ─────────────────────────

    getDeviceHistory(mac, limit = 100) {
        try {
            return this.db.prepare(
                `SELECT * FROM connection_events WHERE mac = ?
                 ORDER BY timestamp DESC LIMIT ?`
            ).all(mac, Math.min(limit, 500));
        } catch (error) {
            console.error('Error getting device history:', error);
            throw error;
        }
    }

    getConnectionSummary(mac) {
        try {
            const device = this.db.prepare(`SELECT * FROM devices WHERE mac = ?`).get(mac);
            if (!device) return null;

            const totalEvents = this.db.prepare(
                `SELECT COUNT(*) as cnt FROM connection_events WHERE mac = ?`
            ).get(mac);

            const firstEvent = this.db.prepare(
                `SELECT timestamp FROM connection_events WHERE mac = ? ORDER BY timestamp ASC LIMIT 1`
            ).get(mac);

            const lastEvent = this.db.prepare(
                `SELECT timestamp FROM connection_events WHERE mac = ? ORDER BY timestamp DESC LIMIT 1`
            ).get(mac);

            return {
                mac,
                custom_name: device.custom_name,
                hostname: device.hostname,
                first_seen: device.first_seen,
                last_seen: device.last_seen,
                total_connections: totalEvents ? totalEvents.cnt : 0,
                first_event: firstEvent ? firstEvent.timestamp : null,
                last_event: lastEvent ? lastEvent.timestamp : null
            };
        } catch (error) {
            console.error('Error getting connection summary:', error);
            throw error;
        }
    }

    // ── Network topology (Feature 9) ──────────────────────────────────

    getTopology() {
        try {
            const devices = this.db.prepare(
                `SELECT mac, custom_name, hostname, name, ip, vendor, is_wired, is_online,
                        ap_mac, signal, device_type, acknowledged, watch_connection
                 FROM devices ORDER BY ap_mac NULLS LAST, hostname`
            ).all();

            // Group by AP MAC
            const apMap = {};
            for (const d of devices) {
                const apKey = d.is_wired ? 'wired' : (d.ap_mac || 'unknown');
                if (!apMap[apKey]) apMap[apKey] = { ap_mac: apKey, devices: [] };
                apMap[apKey].devices.push({
                    ...d,
                    is_wired: Boolean(d.is_wired),
                    is_online: Boolean(d.is_online),
                    acknowledged: Boolean(d.acknowledged),
                    watch_connection: Boolean(d.watch_connection)
                });
            }
            return Object.values(apMap);
        } catch (error) {
            console.error('Error getting topology:', error);
            throw error;
        }
    }

    // ── Export (Feature 13) ───────────────────────────────────────────

    exportDevices() {
        try {
            return this.db.prepare(
                `SELECT mac, custom_name, hostname, name, ip, vendor,
                        device_type, os_name, is_wired, is_online, is_blocked,
                        ap_mac, network, signal, tx_bytes, rx_bytes,
                        first_seen, last_seen, detected_at,
                        acknowledged, acknowledged_at, watch_connection,
                        tags, note
                 FROM devices ORDER BY first_seen`
            ).all();
        } catch (error) {
            console.error('Error exporting devices:', error);
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