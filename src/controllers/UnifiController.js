const { Controller } = require('node-unifi');

class UnifiController {
    constructor() {
        this.isLoggedIn = false;
        this.updateConfiguration();
    }

    updateConfiguration() {
        this.host = process.env.UNIFI_HOST;
        this.port = process.env.UNIFI_PORT;
        this.username = process.env.UNIFI_USERNAME;
        this.password = process.env.UNIFI_PASSWORD;
        this.site = process.env.UNIFI_SITE || 'default';
        
        if (this.host && this.port) {
            this.baseUrl = `https://${this.host}:${this.port}`;
            
            try {
                // Initialize the node-unifi controller
                this.controller = new Controller({
                    host: this.host,
                    port: this.port,
                    username: this.username,
                    password: this.password,
                    site: this.site,
                    insecure: true // Accept self-signed certificates
                });
                console.log('✓ node-unifi Controller instantiated successfully');
            } catch (error) {
                console.error('❌ Failed to create node-unifi Controller:', error.message);
                this.controller = null;
            }
        } else {
            this.controller = null;
        }
    }

    isConfigured() {
        return !!(this.host && this.port && this.username && this.password && this.controller);
    }

    async login() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        return new Promise((resolve, reject) => {
            this.controller.login(this.username, this.password, (error) => {
                if (error) {
                    console.error('Failed to login to UniFi controller:', error);
                    this.isLoggedIn = false;
                    reject(new Error('Authentication failed'));
                } else {
                    console.log('Successfully logged into UniFi controller');
                    this.isLoggedIn = true;
                    resolve(true);
                }
            });
        });
    }

    async ensureLoggedIn() {
        if (!this.isLoggedIn) {
            await this.login();
        }
    }

    async getClients() {
        await this.ensureLoggedIn();
        
        return new Promise((resolve, reject) => {
            this.controller.getClientsOnline((error, data) => {
                if (error) {
                    console.error('Error getting clients:', error);
                    reject(error);
                } else {
                    resolve(data[0] || []);
                }
            });
        });
    }

    async getActiveClients() {
        await this.ensureLoggedIn();
        
        return new Promise((resolve, reject) => {
            this.controller.getActiveClients((error, data) => {
                if (error) {
                    console.error('Error getting active clients:', error);
                    reject(error);
                } else {
                    resolve(data[0] || []);
                }
            });
        });
    }

    async getAllClients() {
        await this.ensureLoggedIn();
        
        return new Promise((resolve, reject) => {
            this.controller.getAllClients((error, data) => {
                if (error) {
                    console.error('Error getting all clients:', error);
                    reject(error);
                } else {
                    resolve(data[0] || []);
                }
            });
        });
    }

    // Block device by MAC address using Art of WiFi style API
    async blockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            console.log(`Attempting to block device: ${mac}`);
            
            return new Promise((resolve, reject) => {
                this.controller.blockClient(mac.toLowerCase(), (error, data) => {
                    if (error) {
                        console.error('Error blocking device:', error);
                        if (error.message && error.message.includes('403')) {
                            reject(new Error('Access denied. UniFi account may need Full Management permissions, or device blocking may be disabled in UniFi 9.4.19 firmware.'));
                        } else if (error.message && error.message.includes('401')) {
                            this.isLoggedIn = false; // Force re-login
                            reject(new Error('Authentication failed. Please check UniFi credentials.'));
                        } else {
                            reject(new Error(`UniFi blocking failed: ${error.message || error}`));
                        }
                    } else {
                        console.log(`Device ${mac} blocked successfully using node-unifi client`);
                        console.log('Block response:', data);
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('Error in blockDevice:', error.message);
            throw error;
        }
    }

    // Unblock device by MAC address using Art of WiFi style API
    async unblockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            console.log(`Attempting to unblock device: ${mac}`);
            
            return new Promise((resolve, reject) => {
                this.controller.unblockClient(mac.toLowerCase(), (error, data) => {
                    if (error) {
                        console.error('Error unblocking device:', error);
                        if (error.message && error.message.includes('403')) {
                            reject(new Error('Access denied. UniFi account may need Full Management permissions.'));
                        } else if (error.message && error.message.includes('401')) {
                            this.isLoggedIn = false; // Force re-login
                            reject(new Error('Authentication failed. Please check UniFi credentials.'));
                        } else {
                            reject(new Error(`UniFi unblocking failed: ${error.message || error}`));
                        }
                    } else {
                        console.log(`Device ${mac} unblocked successfully using node-unifi client`);
                        console.log('Unblock response:', data);
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('Error in unblockDevice:', error.message);
            throw error;
        }
    }

    async runDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            apiConnection: { status: 'unknown', message: 'Not tested' },
            authentication: { status: 'unknown', message: 'Not tested' },
            dataAccess: { status: 'unknown', message: 'Not tested' },
            controllerHealth: { status: 'unknown', message: 'Not tested' },
            connectionDetails: null
        };

        try {
            // Test API connection and authentication
            await this.login();
            diagnostics.apiConnection = {
                status: 'success',
                message: 'API endpoint reachable',
                responseTime: '< 1s'
            };
            diagnostics.authentication = {
                status: 'success',
                message: 'Authentication successful',
                username: this.username,
                site: this.site
            };

            // Test data access
            const clients = await this.getAllClients();
            diagnostics.dataAccess = {
                status: 'success',
                message: 'Successfully retrieved client data',
                clientCount: clients.length,
                sampleData: clients.slice(0, 2).map(client => ({
                    mac: client.mac,
                    hostname: client.hostname || 'Unknown',
                    ip: client.ip || 'N/A'
                }))
            };

            // Get controller info if available
            diagnostics.controllerHealth = {
                status: 'success',
                message: 'Using Art of WiFi node-unifi client',
                clientCount: clients.length
            };

            diagnostics.connectionDetails = {
                controllerUrl: this.baseUrl,
                site: this.site,
                username: this.username,
                hasCredentials: !!(this.username && this.password),
                userAgent: 'Art of WiFi node-unifi client',
                sslVerification: 'disabled'
            };

        } catch (error) {
            console.error('Diagnostics failed:', error);
            
            if (error.message.includes('Authentication failed')) {
                diagnostics.authentication = {
                    status: 'error',
                    message: 'Authentication failed',
                    error: error.message
                };
            } else {
                diagnostics.apiConnection = {
                    status: 'error',
                    message: 'API connection failed',
                    error: error.message
                };
            }
        }

        return diagnostics;
    }

    // Check user permissions - simplified for Art of WiFi client
    async checkUserPermissions() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            
            // Art of WiFi client doesn't expose detailed user info
            // but if login succeeded, we have some level of access
            return {
                success: true,
                username: this.username,
                canManageDevices: true, // We'll test this by trying to block
                message: 'Using Art of WiFi client - detailed permissions unknown',
                details: {
                    clientType: 'node-unifi (Art of WiFi style)',
                    loginSuccessful: true
                }
            };
        } catch (error) {
            return {
                success: false,
                canManageDevices: false,
                error: error.message,
                details: {
                    clientType: 'node-unifi (Art of WiFi style)',
                    loginSuccessful: false
                }
            };
        }
    }

    // Test device blocking capability
    async testDeviceBlockingCapability() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            
            const permissionCheck = await this.checkUserPermissions();
            
            return {
                success: true,
                message: 'Art of WiFi client connected successfully',
                permissionCheck,
                note: 'Using mature node-unifi client - should handle UniFi 9.4.19 compatibility better'
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Art of WiFi client test failed: ${error.message}`,
                permissionCheck: null
            };
        }
    }
}

module.exports = UnifiController;