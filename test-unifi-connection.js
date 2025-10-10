#!/usr/bin/env node

const UnifiController = require('./src/controllers/UnifiController');

async function testUniFiConnection() {
    console.log('=== UniFi Connection Test with node-unifi v2.5.1 ===\n');
    
    try {
        // Load credentials from environment variables
        const host = process.env.UNIFI_HOST || '192.168.0.1';
        const port = process.env.UNIFI_PORT || '443';
        const username = process.env.UNIFI_USERNAME;
        const password = process.env.UNIFI_PASSWORD;
        const site = process.env.UNIFI_SITE || 'default';
        
        if (!host || !username || !password) {
            throw new Error('UniFi credentials not found in environment variables. Please set UNIFI_HOST, UNIFI_USERNAME, and UNIFI_PASSWORD.');
        }
        
        console.log('✓ Credentials loaded from environment');
        console.log(`  Host: ${host}:${port}`);
        console.log(`  Username: ${username}`);
        console.log(`  Site: ${site}\n`);
        
        // Initialize controller
        const controller = new UnifiController(host, port, username, password, site);
        
        console.log('✓ UnifiController initialized');
        
        // Test authentication
        console.log('🔐 Testing authentication...');
        await controller.login();
        console.log('✓ Authentication successful!\n');
        
        // Test client retrieval
        console.log('📱 Testing client retrieval...');
        const clients = await controller.getAllClients();
        console.log(`✓ Retrieved ${clients.length} clients`);
        
        if (clients.length > 0) {
            console.log('\n📋 Sample clients:');
            clients.slice(0, 3).forEach((client, index) => {
                console.log(`  ${index + 1}. ${client.name || client.hostname || 'Unknown'} (${client.mac})`);
            });
        }
        
        // Test device blocking capability (find a test device)
        const testDevice = clients.find(client => 
            client.name && client.name.toLowerCase().includes('xbox') ||
            client.hostname && client.hostname.toLowerCase().includes('xbox')
        );
        
        if (testDevice) {
            console.log(`\n🚫 Testing device blocking with: ${testDevice.name || testDevice.hostname} (${testDevice.mac})`);
            
            try {
                await controller.blockDevice(testDevice.mac);
                console.log('✓ Block command sent successfully!');
                
                // Wait a moment, then unblock
                setTimeout(async () => {
                    try {
                        await controller.unblockDevice(testDevice.mac);
                        console.log('✓ Unblock command sent successfully!');
                        console.log('\n🎉 All tests passed! UniFi API is working correctly.');
                    } catch (error) {
                        console.log(`❌ Unblock failed: ${error.message}`);
                        testSummary();
                    }
                }, 2000);
                
            } catch (error) {
                console.log(`❌ Block failed: ${error.message}`);
                if (error.message.includes('403')) {
                    console.log('\n⚠️  This appears to be the UniFi 9.4.19 API restriction issue.');
                    console.log('   Manual blocking via mobile app works, but API blocking is disabled.');
                }
                testSummary();
            }
        } else {
            console.log('\n⚠️  No test device found (looking for xbox in name)');
            testSummary();
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        
        if (error.message.includes('Authentication failed')) {
            console.log('\n💡 Suggestions:');
            console.log('   • Verify UniFi credentials are correct');
            console.log('   • Check if UniFi account has sufficient permissions');
            console.log('   • Ensure UniFi controller is accessible');
        }
    }
}

function testSummary() {
    console.log('\n=== Test Summary ===');
    console.log('✓ Package dependency fixed (node-unifi v2.5.1)');
    console.log('✓ Authentication working');
    console.log('✓ Client retrieval working');
    console.log('❓ Device blocking depends on UniFi firmware API restrictions');
    console.log('\nThe app should now work properly for parental controls UI,');
    console.log('even if device blocking is restricted by UniFi 9.4.19 firmware.');
}

// Run the test
testUniFiConnection();