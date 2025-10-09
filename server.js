const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Setup config directory for Unraid mounting
const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const ENV_PATH = path.join(CONFIG_DIR, '.env');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Load environment from config directory
require('dotenv').config({ path: ENV_PATH });

const UnifiController = require('./src/controllers/UnifiController');
const DatabaseManager = require('./src/database/DatabaseManager');
const ParentalControlsManager = require('./src/controllers/ParentalControlsManager');
const Logger = require('./src/utils/Logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize logger
const logger = new Logger();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"]
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database and UniFi controller
const dbManager = new DatabaseManager();
const unifiController = new UnifiController();
const parentalControls = new ParentalControlsManager(unifiController, dbManager);

// Debug: Log static file requests
app.use('/styles.css', (req, res, next) => {
    logger.info('CSS file requested');
    next();
});

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

app.get('/api/stats', async (req, res) => {
    try {
        const allKnownDevices = await unifiController.getAllKnownDevices();
        const dbStats = await dbManager.getDeviceStats();
        
        res.json({
            totalKnown: allKnownDevices.size,
            newDevices: dbStats.unacknowledged,
            acknowledgedDevices: dbStats.acknowledged,
            detectedToday: dbStats.today
        });
    } catch (error) {
        logger.error('Error getting stats:', error.message);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

app.get('/api/version', (req, res) => {
    try {
        const packageJson = require('./package.json');
        let versionInfo = {
            version: packageJson.version,
            packageVersion: packageJson.version
        };

        // Try to read version.json if it exists (created by CI/CD)
        try {
            const versionJson = require('./public/version.json');
            versionInfo = { ...versionInfo, ...versionJson };
        } catch (err) {
            // version.json doesn't exist, use fallback
        }

        // Add environment variables if available (from Docker)
        if (process.env.VERSION) {
            versionInfo.dockerVersion = process.env.VERSION;
        }
        if (process.env.BUILD_DATE) {
            versionInfo.buildDate = process.env.BUILD_DATE;
        }
        if (process.env.VCS_REF) {
            versionInfo.commitHash = process.env.VCS_REF;
        }

        res.json(versionInfo);
    } catch (error) {
        logger.error('Error getting version info:', error.message);
        res.status(500).json({ error: 'Failed to get version info' });
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

// Parental Controls API endpoints
app.get('/api/parental/devices/available', async (req, res) => {
    try {
        const devices = await parentalControls.getAvailableDevices();
        res.json(devices);
    } catch (error) {
        logger.error('Error getting available devices:', error.message);
        res.status(500).json({ error: 'Failed to get available devices' });
    }
});

app.get('/api/parental/devices/managed', async (req, res) => {
    try {
        const devices = await parentalControls.getManagedDevicesStatus();
        res.json(devices);
    } catch (error) {
        logger.error('Error getting managed devices:', error.message);
        res.status(500).json({ error: 'Failed to get managed devices' });
    }
});

app.post('/api/parental/devices/add', async (req, res) => {
    try {
        const result = await parentalControls.addDeviceToParentalControls(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Error adding device to parental controls:', error.message);
        res.status(500).json({ error: 'Failed to add device to parental controls' });
    }
});

app.delete('/api/parental/devices/:mac', async (req, res) => {
    try {
        const result = await parentalControls.removeDeviceFromParentalControls(req.params.mac);
        res.json(result);
    } catch (error) {
        logger.error('Error removing device from parental controls:', error.message);
        res.status(500).json({ error: 'Failed to remove device from parental controls' });
    }
});

app.post('/api/parental/devices/:mac/block', async (req, res) => {
    try {
        const { duration, reason } = req.body;
        const result = await parentalControls.blockDevice(req.params.mac, reason || 'manual', duration);
        res.json(result);
    } catch (error) {
        logger.error('Error blocking device:', error.message);
        res.status(500).json({ error: 'Failed to block device' });
    }
});

app.post('/api/parental/devices/:mac/unblock', async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await parentalControls.unblockDevice(req.params.mac, reason || 'manual');
        res.json(result);
    } catch (error) {
        logger.error('Error unblocking device:', error.message);
        res.status(500).json({ error: 'Failed to unblock device' });
    }
});

app.post('/api/parental/devices/:mac/time-limit', async (req, res) => {
    try {
        const { dailyTimeLimit, bonusTime } = req.body;
        const result = await parentalControls.setTimeLimit(req.params.mac, dailyTimeLimit, bonusTime);
        res.json(result);
    } catch (error) {
        logger.error('Error setting time limit:', error.message);
        res.status(500).json({ error: 'Failed to set time limit' });
    }
});

app.post('/api/parental/devices/:mac/schedule', async (req, res) => {
    try {
        const result = await parentalControls.setSchedule(req.params.mac, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Error setting schedule:', error.message);
        res.status(500).json({ error: 'Failed to set schedule' });
    }
});

app.get('/api/parental/logs/:mac?', async (req, res) => {
    try {
        const logs = await dbManager.getParentalLogs(req.params.mac, parseInt(req.query.limit) || 100);
        res.json(logs);
    } catch (error) {
        logger.error('Error getting parental logs:', error.message);
        res.status(500).json({ error: 'Failed to get parental logs' });
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
        const envPath = ENV_PATH;
        const configDir = path.dirname(envPath);
        
        logger.info(`Attempting to save settings to: ${envPath}`);
        logger.info(`Config directory: ${configDir}`);
        
        // Ensure config directory exists with proper permissions
        if (!fs.existsSync(configDir)) {
            logger.info(`Creating config directory: ${configDir}`);
            fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
        }
        
        // Check if we can write to the config directory
        try {
            fs.accessSync(configDir, fs.constants.W_OK);
            logger.info('Config directory is writable');
        } catch (accessError) {
            logger.error(`Config directory is not writable: ${accessError.message}`);
            throw new Error(`Cannot write to config directory: ${configDir}`);
        }
        
        // Read current .env file or create new content
        let envContent = '';
        if (fs.existsSync(envPath)) {
            logger.info('Reading existing .env file');
            envContent = fs.readFileSync(envPath, 'utf8');
        } else {
            logger.info('Creating new .env file');
            // Create initial .env file with header comment
            envContent = '# UniFi Sentinel Configuration\n# Generated automatically from settings UI\n\n';
        }

        // Update or add settings
        Object.keys(settings).forEach(key => {
            if (settings[key] !== undefined && settings[key] !== '') {
                const pattern = new RegExp(`^${key}=.*`, 'm');
                const newLine = `${key}=${settings[key]}`;
                
                if (pattern.test(envContent)) {
                    envContent = envContent.replace(pattern, newLine);
                } else {
                    envContent += `${newLine}\n`;
                }
            }
        });

        // Write updated .env file
        logger.info('Writing .env file');
        fs.writeFileSync(envPath, envContent, { mode: 0o644 });
        
        // Update process.env with new values
        Object.keys(settings).forEach(key => {
            if (settings[key] !== undefined && settings[key] !== '') {
                process.env[key] = settings[key];
            }
        });
        
        // Update UniFi controller configuration
        unifiController.updateConfiguration();
        
        logger.info('Settings updated successfully and .env file created/updated');
        
        res.json({ 
            success: true, 
            message: '.env file created/updated successfully. Configuration is now active.',
            envFileCreated: !fs.existsSync(envPath)
        });
    } catch (error) {
        logger.error('Error saving settings:', error.message);
        logger.error('Error stack:', error.stack);
        
        // Provide specific error messages
        let errorMessage = 'Failed to save settings';
        if (error.message.includes('EACCES')) {
            errorMessage = 'Permission denied: Cannot write to config directory';
        } else if (error.message.includes('ENOENT')) {
            errorMessage = 'Config directory does not exist and cannot be created';
        } else if (error.message.includes('Cannot write to config directory')) {
            errorMessage = error.message;
        }
        
        res.status(500).json({ 
            error: errorMessage,
            details: error.message,
            configPath: ENV_PATH
        });
    }
});

app.post('/api/test-settings', async (req, res) => {
    try {
        const settings = req.body;
        logger.info('Testing settings configuration');
        
        // Temporarily set environment variables for testing
        const originalEnv = {
            UNIFI_HOST: process.env.UNIFI_HOST,
            UNIFI_PORT: process.env.UNIFI_PORT,
            UNIFI_USERNAME: process.env.UNIFI_USERNAME,
            UNIFI_PASSWORD: process.env.UNIFI_PASSWORD,
            UNIFI_SITE: process.env.UNIFI_SITE
        };
        
        // Set test environment variables
        process.env.UNIFI_HOST = settings.UNIFI_HOST;
        process.env.UNIFI_PORT = settings.UNIFI_PORT;
        process.env.UNIFI_USERNAME = settings.UNIFI_USERNAME;
        process.env.UNIFI_PASSWORD = settings.UNIFI_PASSWORD;
        process.env.UNIFI_SITE = settings.UNIFI_SITE || 'default';
        
        try {
            // Create temporary UniFi controller with test settings
            const testController = new (require('./src/controllers/UnifiController'))();
            testController.updateConfiguration(); // This will read from the temp env vars
            
            // Test connection
            await testController.login();
            
            logger.info('Settings test passed');
            res.json({ success: true, message: 'Settings test successful' });
        } finally {
            // Restore original environment variables
            Object.keys(originalEnv).forEach(key => {
                if (originalEnv[key] !== undefined) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
        }
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
        
        // Check if UniFi controller is configured
        if (unifiController.isConfigured()) {
            // Initialize UniFi controller device tracking baseline
            await unifiController.initializeDeviceTracking();
            
            // Scan for devices every 30 seconds (or configured interval)
            const scanInterval = parseInt(process.env.SCAN_INTERVAL) * 1000 || 30000;
            setInterval(async () => {
                try {
                    if (unifiController.isConfigured()) {
                        const newDevices = await unifiController.scanForNewDevices();
                        if (newDevices.length > 0) {
                            await dbManager.addNewDevices(newDevices);
                            logger.info(`Periodic scan found ${newDevices.length} new device(s)`);
                        }
                    }
                } catch (error) {
                    logger.error('Error in periodic scan:', error.message);
                }
            }, scanInterval);
            
            logger.info(`UniFi Sentinel initialized successfully (scan interval: ${scanInterval/1000}s)`);
        } else {
            logger.warn('UniFi controller not configured. Please configure in settings to enable device scanning.');
            logger.info('UniFi Sentinel started in configuration mode - ready to accept settings.');
        }
    } catch (error) {
        logger.error('Failed to initialize:', error.message);
        // Don't exit - allow the app to start for configuration
        logger.info('Starting in configuration mode due to initialization error.');
    }
}

app.listen(PORT, () => {
    logger.info(`UniFi Sentinel running on http://localhost:${PORT}`);
    
    // Verify static files exist
    const publicDir = path.join(__dirname, 'public');
    const stylesPath = path.join(publicDir, 'styles.css');
    logger.info(`Public directory: ${publicDir}`);
    logger.info(`Styles.css exists: ${fs.existsSync(stylesPath)}`);
    if (fs.existsSync(publicDir)) {
        const files = fs.readdirSync(publicDir);
        logger.info(`Public directory contents: ${files.join(', ')}`);
    }
    
    initialize();
});

module.exports = app;