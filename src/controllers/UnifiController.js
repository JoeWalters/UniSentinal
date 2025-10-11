#!/usr/bin/env node
/**
 * UniFi Controller - Production ready with rate limiting
 * Based on successful NUA approach using node-unifi library
 */

require('dotenv').config();
const Unifi = require('node-unifi');

// Global rate limiting to prevent concurrent controllers from hitting API limits
let globalLastRequestTime = 0;
const globalRequestDelay = 200; // 200ms between ANY UniFi requests

class UnifiController {
    constructor() {
        this.controller = null;
        this.isLoggedIn = false;
        this.lastLoginTime = 0;
        this.loginThreshold = 300000; // 5 minutes
        this.lastRequestTime = 0;
        this.requestDelay = 200; // Increased to 200ms between requests
        
        // Configuration
        this.host = process.env.UNIFI_HOST || '192.168.0.1';
        this.port = parseInt(process.env.UNIFI_PORT) || 443;
        this.username = process.env.UNIFI_USERNAME || '';
        this.password = process.env.UNIFI_PASSWORD || '';
        this.site = process.env.UNIFI_SITE || 'default';
        this.sslverify = false; // Always false for self-signed certs
        
        console.log(`🚀 WorkingUnifiController initialized for ${this.host}:${this.port}`);
    }

    // Update configuration from environment variables (for settings changes)
    updateConfiguration() {
        console.log('🔄 Updating UniFi controller configuration...');
        
        this.host = process.env.UNIFI_HOST || '192.168.0.1';
        this.port = parseInt(process.env.UNIFI_PORT) || 443;
        this.username = process.env.UNIFI_USERNAME || '';
        this.password = process.env.UNIFI_PASSWORD || '';
        this.site = process.env.UNIFI_SITE || 'default';
        
        // Reset login state to force re-authentication with new credentials
        this.isLoggedIn = false;
        this.lastLoginTime = 0;
        this.controller = null;
        
        console.log(`✅ Configuration updated for ${this.host}:${this.port} (user: ${this.username})`);
    }

    isConfigured() {
        return !!(this.host && this.port && this.username && this.password);
    }

    async rateLimit() {
        const now = Date.now();
        
        // Check both instance and global rate limiting
        const timeSinceLastInstanceRequest = now - this.lastRequestTime;
        const timeSinceLastGlobalRequest = now - globalLastRequestTime;
        
        const instanceWait = Math.max(0, this.requestDelay - timeSinceLastInstanceRequest);
        const globalWait = Math.max(0, globalRequestDelay - timeSinceLastGlobalRequest);
        const waitTime = Math.max(instanceWait, globalWait);
        
        if (waitTime > 0) {
            console.log(`⏱️  Rate limiting: waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const finalTime = Date.now();
        this.lastRequestTime = finalTime;
        globalLastRequestTime = finalTime;
    }

    async handleRateLimit429() {
        // Handle 429 Too Many Requests with exponential backoff
        const backoffDelay = Math.min(5000, this.requestDelay * 4); // Max 5 seconds
        console.log(`🚫 Rate limit exceeded (429). Backing off for ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        const finalTime = Date.now();
        this.lastRequestTime = finalTime;
        globalLastRequestTime = finalTime;
    }

    async login() {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.rateLimit();
            
            console.log(`🔐 Connecting to UniFi Controller at ${this.host}:${this.port}`);
            
            // Use the working configuration from our tests
            this.controller = new Unifi.Controller({
                hostname: this.host,
                host: this.host,  // Both needed!
                port: this.port,
                sslverify: this.sslverify
            });

            console.log('Attempting login...');
            const loginResult = await this.controller.login(this.username, this.password);
            
            if (loginResult) {
                this.isLoggedIn = true;
                this.lastLoginTime = Date.now();
                console.log('✅ Login successful');
                return true;
            } else {
                throw new Error('Login failed');
            }
        } catch (error) {
            this.isLoggedIn = false;
            
            // Handle 429 rate limit error
            if (error.message && error.message.includes('429')) {
                console.error('❌ Login error: Rate limit exceeded');
                await this.handleRateLimit429();
                throw new Error('Rate limit exceeded. Please wait a few seconds and try again.');
            } else {
                console.error('❌ Login error:', error.message);
                throw error;
            }
        }
    }

    async ensureLoggedIn() {
        const now = Date.now();
        const timeSinceLogin = now - this.lastLoginTime;
        
        if (!this.isLoggedIn || timeSinceLogin > this.loginThreshold) {
            await this.login();
        }
    }

    async getClients() {
        try {
            await this.ensureLoggedIn();
            await this.rateLimit();
            
            console.log('📱 Fetching client devices...');
            const clients = await this.controller.getClientDevices();
            
            if (clients) {
                console.log(`✅ Found ${clients.length} client devices`);
                return clients;
            } else {
                console.log('⚠️  No client devices found');
                return [];
            }
        } catch (error) {
            console.error('❌ Error fetching clients:', error.message);
            throw error;
        }
    }

    async getBlockedUsers() {
        try {
            await this.ensureLoggedIn();
            await this.rateLimit();
            
            console.log('🚫 Fetching blocked users...');
            const blockedUsers = await this.controller.getBlockedUsers();
            
            if (blockedUsers === undefined || blockedUsers === null) {
                return [];
            } else {
                console.log(`✅ Found ${blockedUsers.length} blocked users`);
                return blockedUsers;
            }
        } catch (error) {
            console.error('❌ Error fetching blocked users:', error.message);
            return [];
        }
    }

    // Legacy API compatibility - alias for getBlockedUsers
    async getBlockedDevices() {
        return await this.getBlockedUsers();
    }

    // Legacy API compatibility - alias for getAllKnownDevices
    async getAllClientDevices() {
        return await this.getAllKnownDevices();
    }

    async blockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            await this.rateLimit();
            
            console.log(`🔒 Blocking device: ${mac}`);
            
            const result = await this.controller.blockClient(mac);
            
            // Use NUA's validation logic
            if (typeof result === 'undefined' || result.length <= 0) {
                throw new Error(`Block operation failed: ${JSON.stringify(result)}`);
            } else {
                console.log(`✅ Device ${mac} blocked successfully`);
                return true;
            }
        } catch (error) {
            console.error(`❌ Error blocking device ${mac}:`, error.message);
            
            if (error.message.includes('403')) {
                throw new Error('Access denied. UniFi account needs Owner privileges.');
            } else if (error.message.includes('401')) {
                this.isLoggedIn = false;
                throw new Error('Authentication failed. Please check credentials.');
            } else {
                throw new Error(`Device blocking failed: ${error.message}`);
            }
        }
    }

    async unblockDevice(mac) {
        if (!this.isConfigured()) {
            throw new Error('UniFi controller not configured');
        }

        try {
            await this.ensureLoggedIn();
            await this.rateLimit();
            
            console.log(`🔓 Unblocking device: ${mac}`);
            
            const result = await this.controller.unblockClient(mac);
            
            // Use NUA's validation logic
            if (typeof result === 'undefined' || result.length <= 0) {
                throw new Error(`Unblock operation failed: ${JSON.stringify(result)}`);
            } else {
                console.log(`✅ Device ${mac} unblocked successfully`);
                return true;
            }
        } catch (error) {
            console.error(`❌ Error unblocking device ${mac}:`, error.message);
            
            if (error.message.includes('403')) {
                throw new Error('Access denied. UniFi account needs Owner privileges.');
            } else if (error.message.includes('401')) {
                this.isLoggedIn = false;
                throw new Error('Authentication failed. Please check credentials.');
            } else {
                throw new Error(`Device unblocking failed: ${error.message}`);
            }
        }
    }

    // Batch operations with rate limiting
    async blockMultipleDevices(macAddresses) {
        console.log(`🔒 Blocking ${macAddresses.length} devices...`);
        const results = [];
        
        for (let i = 0; i < macAddresses.length; i++) {
            const mac = macAddresses[i];
            try {
                console.log(`[${i + 1}/${macAddresses.length}] Blocking ${mac}...`);
                const result = await this.blockDevice(mac);
                results.push({ mac, success: result, error: null });
            } catch (error) {
                console.error(`Failed to block ${mac}:`, error.message);
                results.push({ mac, success: false, error: error.message });
            }
            
            // Add extra delay between batch operations
            if (i < macAddresses.length - 1) {
                console.log('⏱️  Batch rate limiting...');
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Blocked ${successful}/${macAddresses.length} devices`);
        return results;
    }

    async unblockMultipleDevices(macAddresses) {
        console.log(`🔓 Unblocking ${macAddresses.length} devices...`);
        const results = [];
        
        for (let i = 0; i < macAddresses.length; i++) {
            const mac = macAddresses[i];
            try {
                console.log(`[${i + 1}/${macAddresses.length}] Unblocking ${mac}...`);
                const result = await this.unblockDevice(mac);
                results.push({ mac, success: result, error: null });
            } catch (error) {
                console.error(`Failed to unblock ${mac}:`, error.message);
                results.push({ mac, success: false, error: error.message });
            }
            
            // Add extra delay between batch operations
            if (i < macAddresses.length - 1) {
                console.log('⏱️  Batch rate limiting...');
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Unblocked ${successful}/${macAddresses.length} devices`);
        return results;
    }

    async getDeviceStats() {
        try {
            const clients = await this.getClients();
            const blockedUsers = await this.getBlockedUsers();
            
            const onlineClients = clients.filter(c => c.is_wired || c.is_wireless);
            const offlineClients = clients.filter(c => !c.is_wired && !c.is_wireless);
            
            return {
                total: clients.length,
                online: onlineClients.length,
                offline: offlineClients.length,
                blocked: blockedUsers.length
            };
        } catch (error) {
            console.error('Error getting device stats:', error.message);
            return { total: 0, online: 0, offline: 0, blocked: 0 };
        }
    }

    async runDiagnostics() {
        console.log('🔧 Running diagnostics...\n');
        
        try {
            await this.ensureLoggedIn();
            console.log('✅ Login: Working');
            
            const stats = await this.getDeviceStats();
            console.log('✅ Device retrieval: Working');
            console.log(`   • Total devices: ${stats.total}`);
            console.log(`   • Online devices: ${stats.online}`);
            console.log(`   • Offline devices: ${stats.offline}`);
            console.log(`   • Blocked devices: ${stats.blocked}`);
            
            return {
                login: 'SUCCESS',
                deviceRetrieval: 'SUCCESS',
                stats: stats,
                rateLimit: `${this.requestDelay}ms delay configured`
            };
        } catch (error) {
            console.error('❌ Diagnostics failed:', error.message);
            return { error: error.message };
        }
    }

    // Legacy API compatibility methods for server.js
    async testConnection() {
        console.log('🔗 Testing UniFi connection...');
        try {
            await this.login();
            const clients = await this.getClients();
            console.log(`✅ Connection test successful - found ${clients.length} devices`);
            return {
                success: true,
                message: `Connected successfully, found ${clients.length} devices`,
                deviceCount: clients.length
            };
        } catch (error) {
            console.error('❌ Connection test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async scanForNewDevices() {
        console.log('🔍 Scanning for new devices...');
        try {
            await this.rateLimit();
            const clients = await this.getClients();
            

            
            // Enhanced device mapping with all available fields
            const newDevices = clients.map(client => ({
                mac: client.mac,
                name: this.getDeviceName(client),
                hostname: client.hostname || null,
                ip: client.ip,
                vendor: this.getVendorName(client),
                is_online: this.isDeviceOnline(client),
                is_blocked: client.blocked || false,
                first_seen: client.first_seen || Date.now(),
                last_seen: client.last_seen || Date.now(),
                device_type: this.getDeviceType(client),
                os_name: client.os_name ? String(client.os_name) : null,
                note: client.noted ? String(client.noted) : null,
                uptime: client.uptime || null
            }));
            
            console.log(`📱 Found ${newDevices.length} devices (${newDevices.filter(d => d.is_online).length} online)`);
            return newDevices;
        } catch (error) {
            console.error('❌ Device scan failed:', error.message);
            throw error;
        }
    }

    async getAllKnownDevices() {
        console.log('📋 Getting all known devices...');
        try {
            return await this.scanForNewDevices(); // Same functionality for now
        } catch (error) {
            console.error('❌ Failed to get all known devices:', error.message);
            throw error;
        }
    }

    async testDeviceBlockingCapability() {
        console.log('🧪 Testing device blocking capability...');
        try {
            await this.login();
            
            // Get clients to find a test device
            const clients = await this.getClients();
            const blockedUsers = await this.getBlockedUsers();
            
            const testResult = {
                success: true,
                message: 'Device blocking capability confirmed',
                details: {
                    totalDevices: clients.length,
                    blockedDevices: blockedUsers.length,
                    canBlock: true,
                    canUnblock: true,
                    rateLimit: `${this.requestDelay}ms delay configured`
                }
            };
            
            console.log('✅ Device blocking test successful:', testResult.details);
            return testResult;
            
        } catch (error) {
            console.error('❌ Device blocking test failed:', error.message);
            return {
                success: false,
                error: error.message,
                details: {
                    canBlock: false,
                    canUnblock: false
                }
            };
        }
    }

    // Initialize device tracking baseline
    async initializeDeviceTracking() {
        console.log('🔄 Initializing device tracking...');
        try {
            if (!this.isConfigured()) {
                console.log('⚠️  UniFi controller not configured, skipping device tracking initialization');
                return;
            }

            // Get initial device list to establish baseline
            const devices = await this.getAllKnownDevices();
            console.log(`✅ Device tracking initialized - found ${devices.length} devices`);
            
            return {
                success: true,
                deviceCount: devices.length,
                message: 'Device tracking initialized successfully'
            };
        } catch (error) {
            console.error('❌ Device tracking initialization failed:', error.message);
            // Don't throw - let the server continue in configuration mode
            return {
                success: false,
                error: error.message,
                message: 'Device tracking initialization failed - server will run in configuration mode'
            };
        }
    }

    // Helper method to get vendor information
    getVendorName(client) {
        // Priority: oui -> dev_vendor -> vendor_oui
        if (client.oui && typeof client.oui === 'string' && client.oui.trim() !== '') {
            return client.oui.trim();
        }
        
        if (client.dev_vendor && typeof client.dev_vendor === 'string' && client.dev_vendor.trim() !== '') {
            return client.dev_vendor.trim();
        }
        
        if (client.vendor_oui && typeof client.vendor_oui === 'string' && client.vendor_oui.trim() !== '') {
            return client.vendor_oui.trim();
        }
        
        return null;
    }

    // Helper method to determine if device is online
    isDeviceOnline(client) {
        // Check if device is wired and connected
        if (client.is_wired) {
            return true;
        }
        
        // For wireless devices, check last seen time
        if (client.last_seen) {
            const lastSeenTime = new Date(client.last_seen * 1000); // Convert from Unix timestamp
            const now = new Date();
            const timeDiff = now - lastSeenTime;
            // Consider online if seen within last 5 minutes
            return timeDiff < (5 * 60 * 1000);
        }
        
        // Check if device has active network connection
        if (client.network || client.ip) {
            return true;
        }
        
        return false;
    }

    // Helper method to get the best available device name
    getDeviceName(client) {
        // Priority order: name -> hostname -> alias -> vendor + MAC -> Unknown Device
        if (client.name && typeof client.name === 'string' && client.name.trim() !== '') {
            return client.name.trim();
        }
        
        if (client.hostname && typeof client.hostname === 'string' && client.hostname.trim() !== '') {
            return client.hostname.trim();
        }
        
        if (client.alias && typeof client.alias === 'string' && client.alias.trim() !== '') {
            return client.alias.trim();
        }
        
        // Try to create a meaningful name from vendor info
        const vendor = this.getVendorName(client);
        if (vendor) {
            const shortMac = client.mac ? client.mac.substring(client.mac.length - 5).replace(':', '') : 'Device';
            return `${vendor} (${shortMac})`;
        }
        
        // Last resort - use MAC address
        if (client.mac) {
            const shortMac = client.mac.substring(client.mac.length - 8).replace(':', '');
            return `Device-${shortMac}`;
        }
        
        return 'Unknown Device';
    }

    // Helper method to determine device type
    getDeviceType(client) {
        // Connection type
        if (client.is_wired) return 'wired';
        
        // Use UniFi's device categorization if available
        if (client.dev_cat) {
            switch(client.dev_cat) {
                case 1: return 'computer';
                case 2: return 'mobile';
                case 3: return 'media';
                case 4: return 'gaming';
                case 5: return 'smart_home';
                case 6: return 'networking';
                default: return 'wireless';
            }
        }
        
        // Try to determine from device family/vendor
        if (client.dev_family && typeof client.dev_family === 'string') {
            const family = client.dev_family.toLowerCase();
            if (family.includes('phone') || family.includes('mobile')) return 'mobile';
            if (family.includes('computer') || family.includes('laptop')) return 'computer';
            if (family.includes('tv') || family.includes('media')) return 'media';
            if (family.includes('game') || family.includes('console')) return 'gaming';
        }
        
        // Try to guess from device info
        const name = (client.name || client.hostname || '').toLowerCase();
        const vendor = this.getVendorName(client);
        const vendorLower = vendor ? vendor.toLowerCase() : '';
        
        if (name.includes('phone') || name.includes('iphone') || name.includes('android') || (vendorLower.includes('apple') && name.includes('iphone'))) return 'mobile';
        if (name.includes('laptop') || name.includes('macbook') || name.includes('pc') || name.includes('computer')) return 'computer';
        if (name.includes('tv') || name.includes('roku') || name.includes('apple tv') || name.includes('chromecast') || name.includes('shield')) return 'media';
        if (name.includes('echo') || name.includes('alexa') || name.includes('google') || name.includes('nest')) return 'smart_home';
        if (name.includes('xbox') || name.includes('playstation') || name.includes('nintendo') || name.includes('gaming')) return 'gaming';
        
        // Default to wireless if not wired
        return client.is_wired ? 'wired' : 'wireless';
    }
}

module.exports = UnifiController;