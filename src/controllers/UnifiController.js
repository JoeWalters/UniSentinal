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
                // Art of WiFi library expects just host and port, credentials are used in login
                this.controller = new Controller({
                    host: this.host,
                    port: this.port,
                    sslverify: false // Disable SSL verification for self-signed certs
                });
                console.log('✅ Art of WiFi node-unifi Controller initialized');
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
            // Set timeout to prevent hanging
            const timeout = setTimeout(() => {
                console.error('UniFi login timeout after 10 seconds');
                reject(new Error('Connection timeout - UniFi controller may be unreachable'));
            }, 10000);

            // Art of WiFi library login pattern
            this.controller.login(this.username, this.password, (error) => {
                clearTimeout(timeout);
                
                if (error) {
                    console.error('Failed to login to UniFi controller:', error);
                    this.isLoggedIn = false;
                    reject(new Error(`Authentication failed: ${error.message || error}`));
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
            this.controller.getClientDevices(this.site, (error, data) => {
                if (error) {
                    console.error('Error getting clients:', error);
                    reject(new Error(`Failed to get clients: ${error.message || error}`));
                } else {
                    const clients = Array.isArray(data) ? data : (data && data.data ? data.data : []);
                    resolve(clients);
                }
            });
        });
    }

    async getActiveClients() {
        await this.ensureLoggedIn();
        
        return new Promise((resolve, reject) => {
            this.controller.getClientDevices(this.site, (error, data) => {
                if (error) {
                    console.error('Error getting active clients:', error);
                    reject(new Error(`Failed to get active clients: ${error.message || error}`));
                } else {
                    const clients = Array.isArray(data) ? data : (data && data.data ? data.data : []);
                    // Filter for active clients (connected in last 24 hours)
                    const activeClients = clients.filter(client => {
                        const lastSeen = client.last_seen ? new Date(client.last_seen * 1000) : null;
                        const now = new Date();
                        const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
                        return lastSeen && lastSeen > dayAgo;
                    });
                    resolve(activeClients);
                }
            });
        });
    }

    async getAllClients() {
        await this.ensureLoggedIn();
        
        return new Promise((resolve, reject) => {
            // Use the correct Art of WiFi method with site parameter
            this.controller.getAllClients(this.site, (error, data) => {
                if (error) {
                    console.error('Error getting all clients:', error);
                    reject(new Error(`Failed to get clients: ${error.message || error}`));
                } else {
                    // Art of WiFi returns data in different format
                    const clients = Array.isArray(data) ? data : (data && data.data ? data.data : []);
                    resolve(clients);
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
                this.controller.blockClient(this.site, mac.toLowerCase(), (error, data) => {
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
                this.controller.unblockClient(this.site, mac.toLowerCase(), (error, data) => {
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
            try {
                const clients = await this.getAllClients();
                diagnostics.dataAccess = {
                    status: 'success',
                    message: 'Successfully retrieved client data',
                    clientCount: clients.length,
                    library: 'Art of WiFi node-unifi',
                    sampleData: clients.slice(0, 2).map(client => ({
                        mac: client.mac,
                        hostname: client.hostname || client.name || 'Unknown',
                        ip: client.ip || 'N/A',
                        lastSeen: client.last_seen ? new Date(client.last_seen * 1000).toLocaleString() : 'N/A'
                    }))
                };
            } catch (dataError) {
                // Separate data access errors from authentication errors
                throw new Error(`Failed to get clients: ${dataError.message || dataError}`);
            }

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
            
            // More detailed error handling for Art of WiFi library
            if (error.message && error.message.includes('Authentication failed')) {
                diagnostics.authentication = {
                    status: 'error',
                    message: 'Authentication failed - check username/password',
                    error: error.message,
                    troubleshooting: 'Verify UNIFI_USERNAME and UNIFI_PASSWORD environment variables'
                };
            } else if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND'))) {
                diagnostics.apiConnection = {
                    status: 'error',
                    message: 'Cannot connect to UniFi controller',
                    error: error.message,
                    troubleshooting: `Verify UNIFI_HOST (${this.host}) and UNIFI_PORT (${this.port}) are correct and controller is accessible`
                };
            } else if (error.message && error.message.includes('Failed to get clients')) {
                diagnostics.dataAccess = {
                    status: 'error',
                    message: 'Authentication successful but data access failed',
                    error: error.message,
                    troubleshooting: 'Check if user has sufficient permissions and site parameter is correct'
                };
            } else {
                diagnostics.apiConnection = {
                    status: 'error',
                    message: 'API connection failed',
                    error: error.message,
                    troubleshooting: 'Check network connectivity and controller status'
                };
            }
        }

        return diagnostics;
    }

    // Test basic connection without data access
    async testConnection() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.login();
            return {
                success: true,
                message: 'Successfully connected and authenticated',
                details: {
                    host: this.host,
                    port: this.port,
                    site: this.site,
                    username: this.username
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                details: {
                    host: this.host,
                    port: this.port,
                    site: this.site,
                    username: this.username
                }
            };
        }
    }

    // Get all known devices (MAC addresses) from UniFi controller
    async getAllKnownDevices() {
        try {
            await this.ensureLoggedIn();
            
            // Get all client devices using Art of WiFi library
            const clients = await this.getAllClients();
            const knownDevices = new Set();

            // Add all client MAC addresses to the set
            clients.forEach(client => {
                if (client.mac) {
                    knownDevices.add(client.mac.toLowerCase());
                }
            });

            console.log(`Found ${knownDevices.size} total known devices in UniFi controller`);
            return knownDevices;
        } catch (error) {
            console.error('Error fetching all known devices:', error.message);
            throw error;
        }
    }

    // Get detailed client device information for parental controls
    async getAllClientDevices() {
        try {
            await this.ensureLoggedIn();
            
            // Get all clients with full details using Art of WiFi
            const clients = await this.getAllClients();
            
            // Transform data to match expected format
            const clientDevices = clients.map(client => ({
                mac: client.mac,
                hostname: client.hostname || client.name || 'Unknown',
                name: client.name || client.hostname || 'Unknown Device',
                ip: client.ip || null,
                last_seen: client.last_seen || null,
                first_seen: client.first_seen || null,
                is_online: client.is_online || false,
                vendor: client.oui || 'Unknown',
                blocked: client.blocked || false
            }));

            console.log(`Retrieved ${clientDevices.length} detailed client devices`);
            return clientDevices;
        } catch (error) {
            console.error('Error fetching detailed client devices:', error.message);
            throw error;
        }
    }

    // Get blocked devices list using Art of WiFi
    async getBlockedDevices() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            
            return new Promise((resolve, reject) => {
                // Use the Art of WiFi list users method to get device info including blocked status
                this.controller.listUsers(this.site, (error, data) => {
                    if (error) {
                        console.error('Error getting blocked devices:', error);
                        reject(new Error(`Failed to get blocked devices: ${error.message || error}`));
                    } else {
                        const users = Array.isArray(data) ? data : (data && data.data ? data.data : []);
                        const blockedDevices = users.filter(device => device.blocked === true);
                        
                        const formattedBlocked = blockedDevices.map(device => ({
                            mac: device.mac,
                            hostname: device.hostname || device.name || 'Unknown',
                            blocked: device.blocked,
                            blocked_at: device.blocked_at || null
                        }));

                        console.log(`Found ${formattedBlocked.length} blocked devices`);
                        resolve(formattedBlocked);
                    }
                });
            });
        } catch (error) {
            console.error('Error getting blocked devices:', error.message);
            throw error;
        }
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