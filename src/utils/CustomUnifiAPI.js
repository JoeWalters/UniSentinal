/**
 * Custom UniFi API Client
 * A direct implementation that works with older Node.js versions
 */

const https = require('https');
const { Controller } = require('node-unifi');

class CustomUnifiAPI {
    constructor(host, port, username, password, site = 'default') {
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.site = site;
        this.baseUrl = `https://${host}:${port}`;
        this.cookies = '';
        this.isLoggedIn = false;
    }

    // Use the Art of WiFi library for authentication only
    async login() {
        return new Promise((resolve, reject) => {
            try {
                // Use Art of WiFi library for authentication
                const controller = new Controller({
                    host: this.host,
                    port: this.port,
                    sslverify: false
                });
                
                // Apply the base URL workaround
                controller._baseurl = this.baseUrl;
                
                controller.login(this.username, this.password, (error) => {
                    if (error) {
                        reject(new Error(`Authentication failed: ${error.message}`));
                    } else {
                        // Extract cookies from the Art of WiFi controller
                        if (controller._cookies) {
                            this.cookies = controller._cookies;
                            this.isLoggedIn = true;
                            console.log('✅ Custom API authenticated successfully');
                            resolve(true);
                        } else {
                            // Fallback - try to get session from the controller
                            this.isLoggedIn = true;
                            console.log('✅ Custom API authenticated (no cookies extracted)');
                            resolve(true);
                        }
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // Direct HTTP request to UniFi API
    async makeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.host,
                port: this.port,
                path: endpoint,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                rejectUnauthorized: false,
                timeout: 10000
            };

            if (this.cookies) {
                options.headers['Cookie'] = this.cookies;
            }

            if (data && method !== 'GET') {
                const jsonData = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(jsonData);
            }

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', chunk => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const parsed = JSON.parse(responseData);
                            resolve(parsed);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data && method !== 'GET') {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }

    // Get all client devices using direct API
    async getClients() {
        if (!this.isLoggedIn) {
            await this.login();
        }

        // Try different API endpoints that might work
        const endpoints = [
            `/api/s/${this.site}/stat/sta`,
            `/api/s/${this.site}/stat/user`,
            `/api/s/${this.site}/stat/alluser`,
            `/api/s/${this.site}/rest/user`,
            '/api/stat/sta',
            '/api/stat/user',
            '/api/stat/alluser'
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`Trying endpoint: ${endpoint}`);
                const response = await this.makeRequest(endpoint);
                
                if (response && response.data && Array.isArray(response.data)) {
                    console.log(`✅ Success with ${endpoint}: found ${response.data.length} clients`);
                    return response.data;
                } else if (response && Array.isArray(response)) {
                    console.log(`✅ Success with ${endpoint}: found ${response.length} clients (direct array)`);
                    return response;
                }
            } catch (error) {
                console.log(`❌ Failed with ${endpoint}: ${error.message}`);
                // Continue to next endpoint
            }
        }

        // If all endpoints fail, return empty array
        console.log('⚠️  All endpoints failed, returning empty array');
        return [];
    }

    // Get active clients (seen in last 24 hours)
    async getActiveClients() {
        const allClients = await this.getClients();
        
        const activeClients = allClients.filter(client => {
            const lastSeen = client.last_seen ? new Date(client.last_seen * 1000) : null;
            const now = new Date();
            const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            return lastSeen && lastSeen > dayAgo;
        });

        return activeClients;
    }
}

module.exports = CustomUnifiAPI;