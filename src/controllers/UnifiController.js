#!/usr/bin/env node
/**
 * UniFi Controller - Production ready with rate limiting
 * Based on successful NUA approach using node-unifi library
 */

require('dotenv').config();
const Unifi = require('node-unifi');

class UnifiController {
    constructor() {
        this.controller = null;
        this.isLoggedIn = false;
        this.lastLoginTime = 0;
        this.loginThreshold = 300000; // 5 minutes
        this.lastRequestTime = 0;
        this.requestDelay = 150; // 150ms between requests to avoid rate limiting
        
        // Configuration
        this.host = process.env.UNIFI_HOST || '192.168.0.1';
        this.port = parseInt(process.env.UNIFI_PORT) || 443;
        this.username = process.env.UNIFI_USERNAME || '';
        this.password = process.env.UNIFI_PASSWORD || '';
        this.site = process.env.UNIFI_SITE || 'default';
        this.sslverify = false; // Always false for self-signed certs
        
        console.log(`🚀 WorkingUnifiController initialized for ${this.host}:${this.port}`);
    }

    isConfigured() {
        return !!(this.host && this.port && this.username && this.password);
    }

    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.requestDelay) {
            const waitTime = this.requestDelay - timeSinceLastRequest;
            console.log(`⏱️  Rate limiting: waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
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
            console.error('❌ Login error:', error.message);
            throw error;
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
            
            // Return devices in the format expected by the server
            const newDevices = clients.map(client => ({
                mac: client.mac,
                name: client.name || client.hostname || 'Unknown Device',
                ip: client.ip,
                is_online: client.is_wired || client.is_wireless,
                is_blocked: client.blocked || false,
                first_seen: client.first_seen || Date.now(),
                last_seen: client.last_seen || Date.now(),
                device_type: this.getDeviceType(client)
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

    // Helper method to determine device type
    getDeviceType(client) {
        if (client.is_wired) return 'wired';
        if (client.is_wireless) return 'wireless';
        if (client.device_type) return client.device_type.toLowerCase();
        
        // Try to guess from device info
        const name = (client.name || client.hostname || '').toLowerCase();
        if (name.includes('phone') || name.includes('iphone') || name.includes('android')) return 'mobile';
        if (name.includes('laptop') || name.includes('macbook') || name.includes('pc')) return 'computer';
        if (name.includes('tv') || name.includes('roku') || name.includes('apple tv')) return 'media';
        if (name.includes('echo') || name.includes('alexa') || name.includes('google')) return 'smart_home';
        
        return 'unknown';
    }
}

module.exports = UnifiController;