const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const UnifiController = require('./src/controllers/UnifiController');
const DatabaseManager = require('./src/database/DatabaseManager');
const Logger = require('./src/utils/Logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize logger
const logger = new Logger();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database and UniFi controller
const dbManager = new DatabaseManager();
const unifiController = new UnifiController();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/devices', async (req, res) => {
    try {
        const devices = await dbManager.getUnacknowledgedDevices();
        res.json(devices);
    } catch (error) {
        logger.error('Error fetching devices:', error.message);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

app.post('/api/devices/:mac/acknowledge', async (req, res) => {
    try {
        const { mac } = req.params;
        await dbManager.acknowledgeDevice(mac);
        logger.info(`Device acknowledged: ${mac}`);
        res.json({ success: true, message: 'Device acknowledged' });
    } catch (error) {
        logger.error('Error acknowledging device:', error.message);
        res.status(500).json({ error: 'Failed to acknowledge device' });
    }
});

app.get('/api/scan', async (req, res) => {
    try {
        const newDevices = await unifiController.scanForNewDevices();
        if (newDevices.length > 0) {
            await dbManager.addNewDevices(newDevices);
            logger.info(`Manual scan found ${newDevices.length} new device(s)`);
        }
        res.json({ 
            success: true, 
            newDevicesFound: newDevices.length,
            devices: newDevices 
        });
    } catch (error) {
        logger.error('Error scanning for devices:', error.message);
        res.status(500).json({ error: 'Failed to scan for devices' });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const status = await unifiController.getControllerStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error getting controller status:', error.message);
        res.status(500).json({ error: 'Failed to get controller status' });
    }
});

app.get('/api/diagnostics', async (req, res) => {
    try {
        logger.info('Running diagnostics check');
        const diagnostics = await unifiController.runDiagnostics();
        res.json(diagnostics);
    } catch (error) {
        logger.error('Error running diagnostics:', error.message);
        res.status(500).json({ error: 'Failed to run diagnostics' });
    }
});

// Settings management endpoints
app.get('/api/settings', (req, res) => {
    try {
        const settings = {
            UNIFI_HOST: process.env.UNIFI_HOST,
            UNIFI_PORT: process.env.UNIFI_PORT,
            UNIFI_USERNAME: process.env.UNIFI_USERNAME,
            UNIFI_SITE: process.env.UNIFI_SITE,
            PORT: process.env.PORT,
            SCAN_INTERVAL: process.env.SCAN_INTERVAL || '30'
        };
        res.json(settings);
    } catch (error) {
        logger.error('Error getting settings:', error.message);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        const envPath = path.join(__dirname, '.env');
        
        // Read current .env file
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Update or add settings
        Object.keys(settings).forEach(key => {
            if (settings[key] !== undefined && settings[key] !== '') {
                const pattern = new RegExp(`^${key}=.*`, 'm');
                const newLine = `${key}=${settings[key]}`;
                
                if (pattern.test(envContent)) {
                    envContent = envContent.replace(pattern, newLine);
                } else {
                    envContent += `\n${newLine}`;
                }
            }
        });

        // Write updated .env file
        fs.writeFileSync(envPath, envContent.trim() + '\n');
        logger.info('Settings updated successfully');
        
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        logger.error('Error saving settings:', error.message);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

app.post('/api/test-settings', async (req, res) => {
    try {
        const settings = req.body;
        logger.info('Testing settings configuration');
        
        // Create temporary UniFi controller with test settings
        const testController = new (require('./src/controllers/UnifiController'))();
        testController.baseUrl = `https://${settings.UNIFI_HOST}:${settings.UNIFI_PORT}`;
        testController.username = settings.UNIFI_USERNAME;
        testController.password = settings.UNIFI_PASSWORD;
        testController.site = settings.UNIFI_SITE || 'default';
        
        // Test connection
        await testController.login();
        
        logger.info('Settings test passed');
        res.json({ success: true, message: 'Settings test successful' });
    } catch (error) {
        logger.warn('Settings test failed:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Logs endpoint
app.get('/api/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = logger.getRecentLogs(limit);
        res.json(logs);
    } catch (error) {
        logger.error('Error getting logs:', error.message);
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

// Initialize database and start periodic scanning
async function initialize() {
    try {
        logger.info('Initializing UniFi Sentinel...');
        await dbManager.initialize();
        
        // Initialize UniFi controller device tracking baseline
        await unifiController.initializeDeviceTracking();
        
        // Scan for devices every 30 seconds (or configured interval)
        const scanInterval = parseInt(process.env.SCAN_INTERVAL) * 1000 || 30000;
        setInterval(async () => {
            try {
                const newDevices = await unifiController.scanForNewDevices();
                if (newDevices.length > 0) {
                    await dbManager.addNewDevices(newDevices);
                    logger.info(`Periodic scan found ${newDevices.length} new device(s)`);
                }
            } catch (error) {
                logger.error('Error in periodic scan:', error.message);
            }
        }, scanInterval);
        
        logger.info(`UniFi Sentinel initialized successfully (scan interval: ${scanInterval/1000}s)`);
    } catch (error) {
        logger.error('Failed to initialize:', error.message);
        process.exit(1);
    }
}

app.listen(PORT, () => {
    logger.info(`UniFi Sentinel running on http://localhost:${PORT}`);
    initialize();
});

module.exports = app;