const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logsDir = './logs';
        this.logFile = path.join(this.logsDir, 'app.log');
        this.maxLogSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 5;
        this.logs = []; // In-memory log storage for recent logs
        this.maxMemoryLogs = 1000;
        
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    formatLogEntry(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        // Add to memory logs
        this.logs.unshift(logEntry);
        if (this.logs.length > this.maxMemoryLogs) {
            this.logs = this.logs.slice(0, this.maxMemoryLogs);
        }

        return logEntry;
    }

    writeToFile(logEntry) {
        const logLine = `${logEntry.timestamp} [${logEntry.level.toUpperCase()}] ${logEntry.message}${logEntry.data ? ' ' + JSON.stringify(logEntry.data) : ''}\n`;
        
        try {
            // Check file size and rotate if needed
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                if (stats.size > this.maxLogSize) {
                    this.rotateLogFile();
                }
            }

            fs.appendFileSync(this.logFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    rotateLogFile() {
        try {
            // Move existing log files
            for (let i = this.maxLogFiles - 1; i > 0; i--) {
                const oldFile = path.join(this.logsDir, `app.log.${i}`);
                const newFile = path.join(this.logsDir, `app.log.${i + 1}`);
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxLogFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest log
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }

            // Move current log to .1
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, path.join(this.logsDir, 'app.log.1'));
            }
        } catch (error) {
            console.error('Failed to rotate log files:', error);
        }
    }

    info(message, data = null) {
        const logEntry = this.formatLogEntry('info', message, data);
        this.writeToFile(logEntry);
        console.log(`[INFO] ${message}`);
    }

    error(message, data = null) {
        const logEntry = this.formatLogEntry('error', message, data);
        this.writeToFile(logEntry);
        console.error(`[ERROR] ${message}`);
    }

    warn(message, data = null) {
        const logEntry = this.formatLogEntry('warn', message, data);
        this.writeToFile(logEntry);
        console.warn(`[WARN] ${message}`);
    }

    debug(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            const logEntry = this.formatLogEntry('debug', message, data);
            this.writeToFile(logEntry);
            console.log(`[DEBUG] ${message}`);
        }
    }

    getRecentLogs(limit = 100) {
        return this.logs.slice(0, limit);
    }
}

module.exports = Logger;