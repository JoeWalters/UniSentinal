#!/usr/bin/env node
/**
 * UniFi Art of WiFi Library Test Script
 * This script helps debug the Art of WiFi node-unifi library integration
 */

require('dotenv').config();
const { Controller } = require('node-unifi');

async function testUnifiConnection() {
    console.log('🔧 Testing Art of WiFi node-unifi library integration...\n');
    
    // Check environment variables
    console.log('Environment Configuration:');
    console.log(`UNIFI_HOST: ${process.env.UNIFI_HOST || 'NOT SET'}`);
    console.log(`UNIFI_PORT: ${process.env.UNIFI_PORT || 'NOT SET'}`);
    console.log(`UNIFI_USERNAME: ${process.env.UNIFI_USERNAME || 'NOT SET'}`);
    console.log(`UNIFI_PASSWORD: ${process.env.UNIFI_PASSWORD ? 'SET' : 'NOT SET'}`);
    console.log(`UNIFI_SITE: ${process.env.UNIFI_SITE || 'default'}\n`);
    
    if (!process.env.UNIFI_HOST || !process.env.UNIFI_PORT || !process.env.UNIFI_USERNAME || !process.env.UNIFI_PASSWORD) {
        console.error('❌ Missing required environment variables');
        process.exit(1);
    }
    
    try {
        // Initialize controller
        console.log('1️⃣ Initializing Art of WiFi Controller...');
        const controller = new Controller({
            host: process.env.UNIFI_HOST,
            port: process.env.UNIFI_PORT,
            sslverify: false
        });
        console.log('✅ Controller initialized\n');
        
        // Test login
        console.log('2️⃣ Testing login...');
        await new Promise((resolve, reject) => {
            controller.login(process.env.UNIFI_USERNAME, process.env.UNIFI_PASSWORD, (error) => {
                if (error) {
                    console.error('❌ Login failed:', error);
                    reject(error);
                } else {
                    console.log('✅ Login successful\n');
                    resolve();
                }
            });
        });
        
        // Test getting client devices
        console.log('3️⃣ Testing client device retrieval...');
        const site = process.env.UNIFI_SITE || 'default';
        
        const clients = await new Promise((resolve, reject) => {
            controller.getAllClients(site, (error, data) => {
                if (error) {
                    console.error('❌ Failed to get clients:', error);
                    reject(error);
                } else {
                    console.log('✅ Successfully retrieved clients');
                    console.log('Raw data structure:', typeof data, Array.isArray(data) ? 'Array length: ' + data.length : 'Not an array');
                    if (data && data.data) {
                        console.log('Data has .data property with length:', data.data.length);
                    }
                    const clients = Array.isArray(data) ? data : (data && data.data ? data.data : []);
                    console.log(`📊 Found ${clients.length} clients\n`);
                    resolve(clients);
                }
            });
        });
        
        // Show sample client data
        if (clients.length > 0) {
            console.log('4️⃣ Sample client data:');
            const sample = clients.slice(0, 2);
            sample.forEach((client, index) => {
                console.log(`Client ${index + 1}:`);
                console.log(`  MAC: ${client.mac || 'N/A'}`);
                console.log(`  Hostname: ${client.hostname || client.name || 'N/A'}`);
                console.log(`  IP: ${client.ip || 'N/A'}`);
                console.log(`  Last Seen: ${client.last_seen ? new Date(client.last_seen * 1000).toLocaleString() : 'N/A'}`);
                console.log('');
            });
            console.log('🎉 Art of WiFi integration test completed successfully!');
        } else {
            console.log('⚠️  No clients found - this might indicate a permissions issue or empty network');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted');
    process.exit(0);
});

// Run the test
testUnifiConnection().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});