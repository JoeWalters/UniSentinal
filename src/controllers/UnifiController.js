const axios = require('axios');
const https = require('https');

class UnifiController {
    constructor() {
        this.updateConfiguration();
        this.cookies = '';
        
        // Configure axios to ignore SSL certificate issues (common with UniFi controllers)
        this.axiosInstance = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            timeout: 10000
        });
    }

    updateConfiguration() {
        this.host = process.env.UNIFI_HOST;
        this.port = process.env.UNIFI_PORT;
        this.username = process.env.UNIFI_USERNAME;
        this.password = process.env.UNIFI_PASSWORD;
        this.site = process.env.UNIFI_SITE || 'default';
        
        if (this.host && this.port) {
            this.baseUrl = `https://${this.host}:${this.port}`;
        } else {
            this.baseUrl = null;
        }
    }

    isConfigured() {
        return !!(this.host && this.port && this.username && this.password);
    }

    async login() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured. Please configure in settings.');
        }

        try {
            const response = await this.axiosInstance.post(`${this.baseUrl}/api/auth/login`, {
                username: this.username,
                password: this.password
            });

            if (response.headers['set-cookie']) {
                this.cookies = response.headers['set-cookie'].join('; ');
            }

            console.log('Successfully logged into UniFi controller');
            return true;
        } catch (error) {
            console.error('Failed to login to UniFi controller:', error.message);
            throw new Error('Authentication failed');
        }
    }

    async makeAuthenticatedRequest(endpoint, method = 'GET', data = null) {
        try {
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Cookie': this.cookies,
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await this.axiosInstance(config);
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 401) {
                // Re-authenticate and retry
                await this.login();
                return this.makeAuthenticatedRequest(endpoint, method, data);
            }
            throw error;
        }
    }

    async getClients() {
        try {
            if (!this.cookies) {
                await this.login();
            }

            const response = await this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/sta`);
            return response.data || [];
        } catch (error) {
            console.error('Error fetching clients:', error.message);
            throw error;
        }
    }

    async getAllKnownDevices() {
        try {
            if (!this.cookies) {
                await this.login();
            }

            // Get all known devices from multiple endpoints
            const [activeClients, allUsers, blockedClients] = await Promise.all([
                // Currently connected/active clients
                this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/sta`),
                // All user devices (includes offline devices)
                this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/list/user`),
                // Get blocked/restricted clients
                this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/list/user`).catch(() => ({ data: [] }))
            ]);

            const knownDevices = new Set();

            // Add active clients
            if (activeClients.data) {
                activeClients.data.forEach(client => {
                    knownDevices.add(client.mac.toLowerCase());
                });
            }

            // Add all user devices (includes historical/offline devices)
            if (allUsers.data) {
                allUsers.data.forEach(user => {
                    knownDevices.add(user.mac.toLowerCase());
                });
            }

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
            if (!this.cookies) {
                await this.login();
            }

            // Get both active and historical client data
            const [activeClients, allUsers] = await Promise.all([
                // Currently connected/active clients with full details
                this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/sta`),
                // All user devices (includes offline devices with aliases)
                this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/list/user`)
            ]);

            const deviceMap = new Map();

            // Process active clients first (they have the most current data)
            if (activeClients.data) {
                activeClients.data.forEach(client => {
                    const mac = client.mac.toLowerCase();
                    deviceMap.set(mac, {
                        mac: mac,
                        hostname: client.hostname || client.name || null,
                        ip: client.ip || null,
                        vendor: client.oui || null,
                        is_online: true,
                        is_wired: client.is_wired || false,
                        ap_mac: client.ap_mac || null,
                        network: client.network || null,
                        signal: client.signal || null,
                        tx_bytes: client.tx_bytes || 0,
                        rx_bytes: client.rx_bytes || 0,
                        last_seen: new Date().toISOString(),
                        user_alias: null // Will be filled from user data
                    });
                });
            }

            // Process all users to get aliases and historical devices
            if (allUsers.data) {
                allUsers.data.forEach(user => {
                    const mac = user.mac.toLowerCase();
                    
                    if (deviceMap.has(mac)) {
                        // Update existing device with user alias
                        const device = deviceMap.get(mac);
                        device.user_alias = user.name || user.alias || null;
                        device.hostname = device.hostname || user.hostname || null;
                    } else {
                        // Add offline/historical device
                        deviceMap.set(mac, {
                            mac: mac,
                            hostname: user.hostname || user.name || null,
                            ip: user.fixed_ip || null,
                            vendor: user.oui || null,
                            is_online: false,
                            is_wired: user.is_wired || false,
                            ap_mac: null,
                            network: user.network || null,
                            signal: null,
                            tx_bytes: user.tx_bytes || 0,
                            rx_bytes: user.rx_bytes || 0,
                            last_seen: user.last_seen ? new Date(user.last_seen * 1000).toISOString() : null,
                            user_alias: user.name || user.alias || null
                        });
                    }
                });
            }

            const devices = Array.from(deviceMap.values());
            
            // Filter out infrastructure devices (APs, switches, etc.) and keep only client devices
            const clientDevices = devices.filter(device => {
                // Skip devices that look like infrastructure
                const hostname = (device.hostname || '').toLowerCase();
                const alias = (device.user_alias || '').toLowerCase();
                
                // Skip common infrastructure device names
                const infrastructureKeywords = ['ap-', 'switch', 'gateway', 'router', 'unifi', 'ubnt', 'access-point'];
                const isInfrastructure = infrastructureKeywords.some(keyword => 
                    hostname.includes(keyword) || alias.includes(keyword)
                );
                
                // Skip devices without meaningful names that are likely infrastructure
                const hasUsefulName = device.hostname || device.user_alias;
                
                return !isInfrastructure && hasUsefulName;
            });

            console.log(`Found ${clientDevices.length} client devices (filtered from ${devices.length} total devices)`);
            return clientDevices;
        } catch (error) {
            console.error('Error fetching client devices:', error.message);
            throw error;
        }
    }

    async scanForNewDevices() {
        try {
            // Get currently active/connected clients
            const clients = await this.getClients();
            
            // Get all devices that the UniFi controller has ever seen
            const allKnownDevices = await this.getAllKnownDevices();
            
            const newDevices = [];

            // Only report devices that are currently active AND not in the known devices list
            clients.forEach(client => {
                const macLower = client.mac.toLowerCase();
                
                // Check if this device is truly new (never seen by UniFi controller before)
                if (!allKnownDevices.has(macLower)) {
                    const deviceInfo = {
                        mac: client.mac,
                        ip: client.ip,
                        hostname: client.hostname || client.name || 'Unknown Device',
                        vendor: client.oui || 'Unknown Vendor',
                        first_seen: new Date(client.first_seen * 1000).toISOString(),
                        last_seen: new Date(client.last_seen * 1000).toISOString(),
                        is_wired: client.is_wired || false,
                        ap_mac: client.ap_mac || null,
                        network: client.network || null,
                        signal: client.signal || null,
                        tx_bytes: client.tx_bytes || 0,
                        rx_bytes: client.rx_bytes || 0
                    };

                    newDevices.push(deviceInfo);
                    console.log(`Found truly NEW device: ${deviceInfo.hostname} (${deviceInfo.mac})`);
                }
            });

            if (newDevices.length === 0) {
                console.log('No new devices detected - all active devices are already known to the controller');
            }

            return newDevices;
        } catch (error) {
            console.error('Error scanning for new devices:', error.message);
            throw error;
        }
    }

    async getControllerStatus() {
        try {
            if (!this.cookies) {
                await this.login();
            }

            const response = await this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/health`);
            const sysinfo = await this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/sysinfo`);

            return {
                connected: true,
                health: response.data || [],
                sysinfo: sysinfo.data || [],
                lastCheck: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting controller status:', error.message);
            return {
                connected: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    async initializeDeviceTracking() {
        try {
            // Get all known devices to establish what the controller already knows about
            const allKnownDevices = await this.getAllKnownDevices();
            console.log(`Initialized device tracking - UniFi controller knows about ${allKnownDevices.size} devices`);
            console.log('Will only report devices that are completely new to the network');
        } catch (error) {
            console.error('Error initializing device tracking:', error);
        }
    }

    async runDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            apiConnection: { status: 'testing' },
            authentication: { status: 'testing' },
            dataAccess: { status: 'testing' },
            controllerHealth: { status: 'testing' },
            connectionDetails: {}
        };

        // Test 1: API Connection
        try {
            const startTime = Date.now();
            const response = await this.axiosInstance.get(`${this.baseUrl}/status`, {
                timeout: 5000,
                httpsAgent: new (require('https')).Agent({
                    rejectUnauthorized: false
                })
            });
            const responseTime = Date.now() - startTime;
            
            diagnostics.apiConnection = {
                status: 'success',
                message: 'API endpoint reachable',
                responseTime: `${responseTime}ms`,
                httpStatus: response.status
            };
        } catch (error) {
            diagnostics.apiConnection = {
                status: 'error',
                message: 'Cannot reach UniFi controller',
                error: error.code || error.message,
                details: `Check if ${this.baseUrl} is accessible`
            };
        }

        // Test 2: Authentication
        try {
            await this.login();
            diagnostics.authentication = {
                status: 'success',
                message: 'Authentication successful',
                username: this.username,
                site: this.site
            };
        } catch (error) {
            diagnostics.authentication = {
                status: 'error',
                message: 'Authentication failed',
                error: error.message,
                details: 'Check username and password in .env file'
            };
        }

        // Test 3: Data Access (requires authentication)
        if (diagnostics.authentication.status === 'success') {
            try {
                const clients = await this.getClients();
                diagnostics.dataAccess = {
                    status: 'success',
                    message: 'Successfully retrieved client data',
                    clientCount: clients.length,
                    sampleData: clients.slice(0, 2).map(client => ({
                        mac: client.mac,
                        hostname: client.hostname || 'Unknown',
                        ip: client.ip
                    }))
                };
            } catch (error) {
                diagnostics.dataAccess = {
                    status: 'error',
                    message: 'Cannot retrieve client data',
                    error: error.message
                };
            }
        } else {
            diagnostics.dataAccess = {
                status: 'error',
                message: 'Skipped - authentication required',
                details: 'Cannot test data access without valid authentication'
            };
        }

        // Test 4: Controller Health (requires authentication)
        if (diagnostics.authentication.status === 'success') {
            try {
                const health = await this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/health`);
                const sysinfo = await this.makeAuthenticatedRequest(`/proxy/network/api/s/${this.site}/stat/sysinfo`);
                
                diagnostics.controllerHealth = {
                    status: 'success',
                    message: 'Controller health data retrieved',
                    healthItems: health.data ? health.data.length : 0,
                    systemInfo: sysinfo.data ? sysinfo.data.slice(0, 1) : []
                };
            } catch (error) {
                diagnostics.controllerHealth = {
                    status: 'warning',
                    message: 'Health data partially available',
                    error: error.message
                };
            }
        } else {
            diagnostics.controllerHealth = {
                status: 'error',
                message: 'Skipped - authentication required',
                details: 'Cannot test controller health without valid authentication'
            };
        }

        // Connection Details
        diagnostics.connectionDetails = {
            controllerUrl: this.baseUrl,
            site: this.site,
            username: this.username,
            hasCredentials: !!(this.username && this.password),
            userAgent: 'UniFi Sentinel',
            sslVerification: 'disabled'
        };

        return diagnostics;
    }

    // Block device by MAC address
    async blockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            console.log(`Attempting to block device: ${mac}`);
            
            // Use makeAuthenticatedRequest which handles auth and retries
            const result = await this.makeAuthenticatedRequest(
                `/api/s/${this.site}/cmd/stamgr`,
                'POST',
                {
                    cmd: 'block-sta',
                    mac: mac.toLowerCase()
                }
            );

            console.log(`Block device response:`, result);
            
            if (result.meta && result.meta.rc === 'ok') {
                console.log(`Device ${mac} blocked successfully`);
                return true;
            } else {
                const errorMessage = result.meta?.msg || 'Unknown error from UniFi controller';
                console.error(`Failed to block device ${mac}:`, errorMessage);
                throw new Error(`UniFi controller error: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error blocking device:', error.message);
            
            // Provide more specific error messages
            if (error.response) {
                const status = error.response.status;
                const responseData = error.response.data;
                
                if (status === 403) {
                    // Enhanced 403 error with more possibilities
                    const possibleCauses = [
                        'User account lacks device management permissions',
                        'UniFi controller firmware may have permission changes',
                        'Site-specific permission restrictions',
                        'Controller in read-only mode or maintenance',
                        'API endpoint access restricted'
                    ];
                    
                    throw new Error(`Access denied (403). This could be caused by:\n${possibleCauses.map(c => `• ${c}`).join('\n')}\n\nRun permission diagnostic via /api/permissions for detailed analysis.`);
                } else if (status === 401) {
                    throw new Error('Authentication failed. Please check UniFi credentials.');
                } else if (status === 404) {
                    throw new Error('Device not found or UniFi site incorrect.');
                } else if (status === 400) {
                    throw new Error(`Bad request (400): Device MAC may be invalid or already in requested state. ${responseData?.error?.message || ''}`);
                } else {
                    throw new Error(`UniFi controller returned ${status}: ${responseData?.error?.message || error.message}`);
                }
            }
            
            throw error;
        }
    }

    // Unblock device by MAC address
    async unblockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            console.log(`Attempting to unblock device: ${mac}`);
            
            // Use makeAuthenticatedRequest which handles auth and retries
            const result = await this.makeAuthenticatedRequest(
                `/api/s/${this.site}/cmd/stamgr`,
                'POST',
                {
                    cmd: 'unblock-sta',
                    mac: mac.toLowerCase()
                }
            );

            console.log(`Unblock device response:`, result);
            
            if (result.meta && result.meta.rc === 'ok') {
                console.log(`Device ${mac} unblocked successfully`);
                return true;
            } else {
                const errorMessage = result.meta?.msg || 'Unknown error from UniFi controller';
                console.error(`Failed to unblock device ${mac}:`, errorMessage);
                throw new Error(`UniFi controller error: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error unblocking device:', error.message);
            
            // Provide more specific error messages
            if (error.response) {
                const status = error.response.status;
                const responseData = error.response.data;
                
                if (status === 403) {
                    throw new Error('Access denied. The UniFi user account needs "Full Management" permissions. Go to UniFi Settings > Admins, find your user account, and ensure it has "Full Management" role or at least "Device Management" permissions to unblock devices.');
                } else if (status === 401) {
                    throw new Error('Authentication failed. Please check UniFi credentials.');
                } else if (status === 404) {
                    throw new Error('Device not found or UniFi site incorrect.');
                } else {
                    throw new Error(`UniFi controller returned ${status}: ${responseData?.error?.message || error.message}`);
                }
            }
            
            throw error;
        }
    }

    // Get blocked devices list
    async getBlockedDevices() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.login();
            
            const response = await this.axiosInstance.get(
                `${this.baseUrl}/api/s/${this.site}/rest/user`,
                {
                    headers: {
                        'Cookie': this.cookies
                    }
                }
            );

            if (response.data?.meta?.rc === 'ok') {
                const blockedDevices = response.data.data.filter(device => device.blocked === true);
                return blockedDevices.map(device => ({
                    mac: device.mac,
                    hostname: device.hostname || device.name || 'Unknown',
                    blocked: device.blocked,
                    blocked_at: device.blocked_at
                }));
            }
            
            return [];
        } catch (error) {
            console.error('Error getting blocked devices:', error.message);
            throw error;
        }
    }

    // Check user permissions for device management
    async checkUserPermissions() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.login();
            
            // Get current admin/user info
            const response = await this.axiosInstance.get(
                `${this.baseUrl}/api/s/${this.site}/self`,
                {
                    headers: {
                        'Cookie': this.cookies
                    }
                }
            );

            if (response.data?.meta?.rc === 'ok' && response.data.data?.length > 0) {
                const userInfo = response.data.data[0];
                
                // Enhanced permission analysis
                const isSuperAdmin = userInfo.is_super || false;
                const role = userInfo.role || 'unknown';
                const permissions = userInfo.permissions || [];
                
                // Check for various permission indicators
                const hasAdminRole = role === 'admin';
                const hasFullManagement = role === 'Full Management' || role === 'full-management';
                const hasDevicePermissions = permissions.some(p => 
                    p.includes('device') || p.includes('block') || p.includes('client') || p.includes('sta')
                );
                
                const canManageDevices = isSuperAdmin || hasAdminRole || hasFullManagement || hasDevicePermissions;
                
                return {
                    success: true,
                    username: userInfo.name,
                    email: userInfo.email,
                    role: role,
                    is_super: isSuperAdmin,
                    permissions: permissions,
                    canManageDevices: canManageDevices,
                    details: {
                        isSuperAdmin,
                        hasAdminRole,
                        hasFullManagement,
                        hasDevicePermissions,
                        permissionsList: permissions
                    },
                    message: isSuperAdmin ? 'Super admin - full access' : 
                            hasFullManagement ? 'Full Management role - should have device access' :
                            hasAdminRole ? 'Admin role - should have device access' :
                            hasDevicePermissions ? 'Has device-specific permissions' :
                            'Limited permissions - may not be able to block devices'
                };
            }

            return { success: false, canManageDevices: false, error: 'Could not retrieve user information' };
        } catch (error) {
            console.error('Error checking user permissions:', error.message);
            return { success: false, canManageDevices: false, error: error.message };
        }
    }

    // Test device blocking capability without actually blocking
    async testDeviceBlockingCapability() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.login();
            
            // First check permissions
            const permissionCheck = await this.checkUserPermissions();
            
            // Try to get a list of clients to test API access
            const clientsResponse = await this.makeAuthenticatedRequest(`/api/s/${this.site}/stat/sta`);
            
            if (!clientsResponse || !clientsResponse.data) {
                return {
                    success: false,
                    error: 'Cannot access client list - insufficient permissions',
                    permissionCheck
                };
            }
            
            // Test with a fake MAC to see what error we get
            try {
                await this.makeAuthenticatedRequest(
                    `/api/s/${this.site}/cmd/stamgr`,
                    'POST',
                    {
                        cmd: 'block-sta',
                        mac: '00:00:00:00:00:00' // Fake MAC that won't exist
                    }
                );
            } catch (testError) {
                // Analyze the test error
                if (testError.response) {
                    const status = testError.response.status;
                    if (status === 403) {
                        return {
                            success: false,
                            error: 'Device blocking is forbidden - permission issue confirmed',
                            httpStatus: status,
                            permissionCheck,
                            recommendation: 'User account needs device management permissions in UniFi'
                        };
                    } else if (status === 400 || status === 404) {
                        // These are expected for fake MAC - means permissions are OK
                        return {
                            success: true,
                            message: 'Device blocking permissions appear to be working',
                            httpStatus: status,
                            permissionCheck,
                            note: 'Test with fake MAC returned expected error - permissions look good'
                        };
                    }
                }
            }
            
            return {
                success: true,
                message: 'Permission test completed successfully',
                permissionCheck
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Permission test failed: ${error.message}`,
                permissionCheck: null
            };
        }
    }
}

module.exports = UnifiController;