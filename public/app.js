class UniFiSentinel {
    constructor() {
        this.devices = [];
        this.selectedDevice = null;
        this.autoRefreshInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.initializeDarkMode(); // Initialize dark mode before loading content
        this.loadDevices();
        this.checkStatus();
        this.loadVersion();
        this.startAutoRefresh();
    }

    bindEvents() {
        // Button events
        document.getElementById('scanBtn').addEventListener('click', () => this.manualScan());
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadDevices());
        // Removed acknowledgeAll button
        document.getElementById('testConnectionBtn').addEventListener('click', () => this.runDiagnostics());
        document.getElementById('darkModeToggle').addEventListener('click', () => this.toggleDarkMode());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettingsModal());
        document.getElementById('diagnosticsToggle').addEventListener('click', () => this.toggleDiagnostics());

        // Modal events
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('modalAcknowledgeBtn').addEventListener('click', () => this.acknowledgeFromModal());

        // Settings modal events
        document.getElementById('closeSettingsModal').addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('settingsCloseBtn').addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('testSettingsBtn').addEventListener('click', () => this.testSettings());
        document.getElementById('refreshLogsBtn').addEventListener('click', () => this.loadLogs());

        // Close modal on background click
        document.getElementById('deviceModal').addEventListener('click', (e) => {
            if (e.target.id === 'deviceModal') {
                this.closeModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async loadDevices() {
        this.showLoading(true);
        
        try {
            const response = await fetch('/api/devices');
            if (!response.ok) throw new Error('Failed to fetch devices');
            
            this.devices = await response.json();
            this.renderDevices();
            this.updateStats();
            this.updateLastUpdated();
        } catch (error) {
            console.error('Error loading devices:', error);
            this.showError('Failed to load devices');
        } finally {
            this.showLoading(false);
        }
    }

    async manualScan() {
        const scanBtn = document.getElementById('scanBtn');
        const originalText = scanBtn.innerHTML;
        
        scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
        scanBtn.disabled = true;

        try {
            const response = await fetch('/api/scan');
            if (!response.ok) throw new Error('Scan failed');
            
            const result = await response.json();
            
            if (result.newDevicesFound > 0) {
                this.showNotification(`Found ${result.newDevicesFound} new device(s)`, 'success');
                await this.loadDevices();
            } else {
                this.showNotification('No new devices found', 'info');
            }
        } catch (error) {
            console.error('Error during manual scan:', error);
            this.showError('Manual scan failed');
        } finally {
            scanBtn.innerHTML = originalText;
            scanBtn.disabled = false;
        }
    }

    async acknowledgeDevice(mac) {
        try {
            const response = await fetch(`/api/devices/${mac}/acknowledge`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Failed to acknowledge device');
            
            this.showNotification('Device acknowledged successfully', 'success');
            await this.loadDevices();
        } catch (error) {
            console.error('Error acknowledging device:', error);
            this.showError('Failed to acknowledge device');
        }
    }

    // Removed acknowledgeAll function - focusing on individual device review

    async checkStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            this.updateStatusIndicator(status.connected, status.error);
            
            // Check if the error indicates missing configuration
            if (status.error && status.error.includes('not configured')) {
                this.showConfigurationPrompt();
            } else if (status.connected) {
                // Connection is successful, hide configuration prompt
                this.hideConfigurationPrompt();
            }
        } catch (error) {
            console.error('Error checking status:', error);
            this.updateStatusIndicator(false, 'Connection check failed');
        }
    }

    showConfigurationPrompt() {
        const noDevices = document.getElementById('noDevices');
        if (noDevices) {
            noDevices.style.display = 'block';
            noDevices.innerHTML = `
                <i class="fas fa-cog"></i>
                <p>UniFi Controller Not Configured</p>
                <small>Use the settings button in the top right to configure your connection</small>
            `;
        }
    }

    hideConfigurationPrompt() {
        const noDevices = document.getElementById('noDevices');
        if (noDevices) {
            noDevices.style.display = 'none';
            noDevices.innerHTML = ''; // Clear the content
        }
    }

    showNoDevicesMessage() {
        const noDevices = document.getElementById('noDevices');
        if (noDevices) {
            noDevices.style.display = 'block';
            noDevices.innerHTML = `
                <i class="fas fa-shield-check"></i>
                <p>No brand new devices detected</p>
                <small>All devices are already known to your UniFi controller</small>
            `;
        }
    }

    renderDevices() {
        const grid = document.getElementById('devicesGrid');
        const noDevices = document.getElementById('noDevices');
        const deviceCount = document.getElementById('deviceCount');

        deviceCount.textContent = this.devices.length;

        if (this.devices.length === 0) {
            grid.style.display = 'none';
            // Only show the "no devices" message if we're not in configuration mode
            // The configuration prompt will be shown by checkStatus() if needed
            this.showNoDevicesMessage();
            return;
        }

        grid.style.display = 'grid';
        noDevices.style.display = 'none';

        grid.innerHTML = this.devices.map(device => this.createDeviceCard(device)).join('');

        // Bind click events for device cards
        grid.querySelectorAll('.device-card').forEach((card, index) => {
            card.addEventListener('click', () => this.showDeviceModal(this.devices[index]));
        });

        // Bind acknowledge buttons
        grid.querySelectorAll('.acknowledge-btn').forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.acknowledgeDevice(this.devices[index].mac);
            });
        });
    }

    createDeviceCard(device) {
        const detectedTime = new Date(device.detected_at).toLocaleString();
        const connectionType = device.is_wired ? 'wired' : 'wireless';
        const connectionIcon = device.is_wired ? 'fas fa-ethernet' : 'fas fa-wifi';

        return `
            <div class="device-card" data-mac="${device.mac}">
                <div class="device-header">
                    <div class="device-info">
                        <h3>${device.hostname || 'Unknown Device'}</h3>
                        <div class="mac-address">${device.mac}</div>
                    </div>
                    <div class="connection-type ${connectionType}">
                        <i class="${connectionIcon}"></i> ${connectionType.toUpperCase()}
                    </div>
                </div>
                
                <div class="device-details">
                    <div class="detail-item">
                        <span class="detail-label">IP Address</span>
                        <span class="detail-value">${device.ip || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Vendor</span>
                        <span class="detail-value">${device.vendor || 'Unknown'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">First Seen</span>
                        <span class="detail-value">${new Date(device.first_seen).toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Detected</span>
                        <span class="detail-value">${detectedTime}</span>
                    </div>
                </div>

                <div class="device-actions">
                    <button class="btn btn-outline btn-small">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                    <button class="btn btn-primary btn-small acknowledge-btn">
                        <i class="fas fa-check"></i> Acknowledge
                    </button>
                </div>
            </div>
        `;
    }

    showDeviceModal(device) {
        this.selectedDevice = device;
        const modal = document.getElementById('deviceModal');
        const modalBody = document.getElementById('modalBody');

        modalBody.innerHTML = this.createDeviceDetails(device);
        modal.style.display = 'block';
    }

    createDeviceDetails(device) {
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        return `
            <div class="device-modal-content">
                <div class="device-summary">
                    <h4>${device.hostname || 'Unknown Device'}</h4>
                    <p class="mac-address">${device.mac}</p>
                </div>

                <div class="detail-grid">
                    <div class="detail-row">
                        <span class="detail-label">IP Address:</span>
                        <span class="detail-value">${device.ip || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Vendor:</span>
                        <span class="detail-value">${device.vendor || 'Unknown'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Connection Type:</span>
                        <span class="detail-value">
                            <i class="fas fa-${device.is_wired ? 'ethernet' : 'wifi'}"></i>
                            ${device.is_wired ? 'Wired' : 'Wireless'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Network:</span>
                        <span class="detail-value">${device.network || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Signal Strength:</span>
                        <span class="detail-value">${device.signal ? device.signal + ' dBm' : 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Access Point:</span>
                        <span class="detail-value">${device.ap_mac || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Data Transmitted:</span>
                        <span class="detail-value">${formatBytes(device.tx_bytes)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Data Received:</span>
                        <span class="detail-value">${formatBytes(device.rx_bytes)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">First Seen:</span>
                        <span class="detail-value">${new Date(device.first_seen).toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Seen:</span>
                        <span class="detail-value">${new Date(device.last_seen).toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Detected by Sentinel:</span>
                        <span class="detail-value">${new Date(device.detected_at).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <style>
                .device-summary {
                    text-align: center;
                    margin-bottom: 25px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid #e9ecef;
                }
                
                .device-summary h4 {
                    color: #2c3e50;
                    margin-bottom: 8px;
                }
                
                .detail-grid {
                    display: grid;
                    gap: 12px;
                }
                
                .detail-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    padding: 8px 0;
                    border-bottom: 1px solid #f8f9fa;
                }
                
                .detail-row .detail-label {
                    font-weight: 600;
                    color: #7f8c8d;
                }
                
                .detail-row .detail-value {
                    color: #2c3e50;
                }
            </style>
        `;
    }

    closeModal() {
        document.getElementById('deviceModal').style.display = 'none';
        this.selectedDevice = null;
    }

    async acknowledgeFromModal() {
        if (this.selectedDevice) {
            await this.acknowledgeDevice(this.selectedDevice.mac);
            this.closeModal();
        }
    }

    async updateStats() {
        try {
            const stats = {
                newDevices: this.devices.length,
                today: this.devices.filter(device => {
                    const today = new Date().toDateString();
                    const deviceDate = new Date(device.detected_at).toDateString();
                    return today === deviceDate;
                }).length
            };

            document.getElementById('unacknowledgedCount').textContent = stats.newDevices;
            document.getElementById('todayCount').textContent = stats.today;
            
            // Get total known devices from server
            try {
                const response = await fetch('/api/stats');
                if (response.ok) {
                    const serverStats = await response.json();
                    document.getElementById('totalKnownCount').textContent = serverStats.totalKnown || '-';
                }
            } catch (error) {
                console.log('Could not fetch server stats:', error);
                document.getElementById('totalKnownCount').textContent = '-';
            }
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    updateStatusIndicator(connected, error = null) {
        const indicator = document.getElementById('statusIndicator');
        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
        text.textContent = connected ? 'Connected' : (error || 'Disconnected');
    }

    updateLastUpdated() {
        document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    }

    async loadVersion() {
        try {
            const response = await fetch('/api/version');
            const versionInfo = await response.json();
            this.displayVersion(versionInfo);
        } catch (error) {
            console.error('Error loading version info:', error);
            document.getElementById('versionInfo').textContent = 'Unknown';
        }
    }

    displayVersion(versionInfo) {
        // Update footer version
        const versionElement = document.getElementById('versionInfo');
        if (versionElement) {
            versionElement.textContent = versionInfo.version || versionInfo.packageVersion || 'Unknown';
        }

        // Update detailed version in settings modal
        const versionDetails = document.getElementById('versionDetails');
        if (versionDetails) {
            versionDetails.innerHTML = `
                <div class="version-grid">
                    <div class="version-item">
                        <strong>Application Version:</strong>
                        <span>${versionInfo.packageVersion || 'Unknown'}</span>
                    </div>
                    ${versionInfo.version && versionInfo.version !== versionInfo.packageVersion ? `
                        <div class="version-item">
                            <strong>Build Version:</strong>
                            <span>${versionInfo.version}</span>
                        </div>
                    ` : ''}
                    ${versionInfo.timestampVersion ? `
                        <div class="version-item">
                            <strong>Build ID:</strong>
                            <span>${versionInfo.timestampVersion}</span>
                        </div>
                    ` : ''}
                    ${versionInfo.commitHash ? `
                        <div class="version-item">
                            <strong>Commit:</strong>
                            <span>${versionInfo.commitHash}</span>
                        </div>
                    ` : ''}
                    ${versionInfo.buildDate ? `
                        <div class="version-item">
                            <strong>Build Date:</strong>
                            <span>${new Date(versionInfo.buildDate).toLocaleString()}</span>
                        </div>
                    ` : ''}
                    ${versionInfo.dockerVersion ? `
                        <div class="version-item">
                            <strong>Docker Version:</strong>
                            <span>${versionInfo.dockerVersion}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('devicesGrid');
        const noDevices = document.getElementById('noDevices');

        if (show) {
            loading.style.display = 'block';
            grid.style.display = 'none';
            noDevices.style.display = 'none';
        } else {
            loading.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification system - you could enhance this with a proper toast library
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
        `;

        // Add notification styles
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            backgroundColor: type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: '9999',
            maxWidth: '300px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => {
            this.loadDevices();
            this.checkStatus();
        }, 30000); // Refresh every 30 seconds
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    async runDiagnostics() {
        const testBtn = document.getElementById('testConnectionBtn');
        const originalText = testBtn.innerHTML;
        
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        testBtn.disabled = true;

        // Reset all diagnostic cards to testing state
        this.setDiagnosticState('apiConnectionIcon', 'apiConnectionStatus', 'apiConnectionDetails', 'testing', 'Testing...', '');
        this.setDiagnosticState('authStatusIcon', 'authStatus', 'authDetails', 'testing', 'Testing...', '');
        this.setDiagnosticState('dataAccessIcon', 'dataAccessStatus', 'dataAccessDetails', 'testing', 'Testing...', '');
        this.setDiagnosticState('controllerHealthIcon', 'controllerHealthStatus', 'controllerHealthDetails', 'testing', 'Testing...', '');

        try {
            const response = await fetch('/api/diagnostics');
            if (!response.ok) throw new Error('Diagnostics request failed');
            
            const diagnostics = await response.json();
            this.displayDiagnostics(diagnostics);
            
        } catch (error) {
            console.error('Error running diagnostics:', error);
            this.showError('Failed to run diagnostics: ' + error.message);
            
            // Show error state for all diagnostics
            this.setDiagnosticState('apiConnectionIcon', 'apiConnectionStatus', 'apiConnectionDetails', 'error', 'Failed', error.message);
            this.setDiagnosticState('authStatusIcon', 'authStatus', 'authDetails', 'error', 'Failed', error.message);
            this.setDiagnosticState('dataAccessIcon', 'dataAccessStatus', 'dataAccessDetails', 'error', 'Failed', error.message);
            this.setDiagnosticState('controllerHealthIcon', 'controllerHealthStatus', 'controllerHealthDetails', 'error', 'Failed', error.message);
        } finally {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }
    }

    displayDiagnostics(diagnostics) {
        // API Connection
        this.setDiagnosticState(
            'apiConnectionIcon',
            'apiConnectionStatus', 
            'apiConnectionDetails',
            diagnostics.apiConnection.status,
            diagnostics.apiConnection.message,
            diagnostics.apiConnection.responseTime ? 
                `Response time: ${diagnostics.apiConnection.responseTime}` :
                diagnostics.apiConnection.details || diagnostics.apiConnection.error || ''
        );

        // Authentication
        this.setDiagnosticState(
            'authStatusIcon',
            'authStatus',
            'authDetails',
            diagnostics.authentication.status,
            diagnostics.authentication.message,
            diagnostics.authentication.username ? 
                `User: ${diagnostics.authentication.username} | Site: ${diagnostics.authentication.site}` :
                diagnostics.authentication.details || diagnostics.authentication.error || ''
        );

        // Data Access
        this.setDiagnosticState(
            'dataAccessIcon',
            'dataAccessStatus',
            'dataAccessDetails',
            diagnostics.dataAccess.status,
            diagnostics.dataAccess.message,
            diagnostics.dataAccess.clientCount !== undefined ? 
                `Found ${diagnostics.dataAccess.clientCount} client(s)` :
                diagnostics.dataAccess.details || diagnostics.dataAccess.error || ''
        );

        // Controller Health
        this.setDiagnosticState(
            'controllerHealthIcon',
            'controllerHealthStatus',
            'controllerHealthDetails',
            diagnostics.controllerHealth.status,
            diagnostics.controllerHealth.message,
            diagnostics.controllerHealth.healthItems !== undefined ?
                `Health items: ${diagnostics.controllerHealth.healthItems}` :
                diagnostics.controllerHealth.details || diagnostics.controllerHealth.error || ''
        );

        // Show connection details
        this.displayConnectionDetails(diagnostics.connectionDetails);
    }

    setDiagnosticState(iconId, statusId, detailsId, state, message, details) {
        const icon = document.getElementById(iconId);
        const status = document.getElementById(statusId);
        const detailsEl = document.getElementById(detailsId);

        // Update icon
        icon.className = `fas diagnostic-icon ${state}`;
        switch (state) {
            case 'success':
                icon.className = 'fas fa-check-circle diagnostic-icon success';
                break;
            case 'error':
                icon.className = 'fas fa-times-circle diagnostic-icon error';
                break;
            case 'warning':
                icon.className = 'fas fa-exclamation-triangle diagnostic-icon warning';
                break;
            case 'testing':
                icon.className = 'fas fa-spinner fa-spin diagnostic-icon testing';
                break;
            default:
                icon.className = 'fas fa-question-circle diagnostic-icon';
        }

        // Update status
        status.textContent = message;
        status.className = `diagnostic-status ${state}`;

        // Update details
        detailsEl.textContent = details;
    }

    displayConnectionDetails(details) {
        const connectionInfo = document.getElementById('connectionInfo');
        const connectionDetails = document.getElementById('connectionDetails');

        if (!details) {
            connectionInfo.style.display = 'none';
            return;
        }

        connectionDetails.innerHTML = `
            <div class="info-item">
                <span class="info-label">Controller URL</span>
                <span class="info-value">${details.controllerUrl || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Site</span>
                <span class="info-value">${details.site || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Username</span>
                <span class="info-value">${details.username || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Credentials</span>
                <span class="info-value">${details.hasCredentials ? 'Configured' : 'Missing'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">SSL Verification</span>
                <span class="info-value">${details.sslVerification || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">User Agent</span>
                <span class="info-value">${details.userAgent || 'N/A'}</span>
            </div>
        `;

        connectionInfo.style.display = 'block';
    }

    // Dark Mode Toggle
    toggleDarkMode() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        const toggleBtn = document.getElementById('darkModeToggle');
        
        if (isDark) {
            body.removeAttribute('data-theme');
            toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('darkMode', 'false');
        } else {
            body.setAttribute('data-theme', 'dark');
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('darkMode', 'true');
        }
    }

    // Initialize dark mode from localStorage
    initializeDarkMode() {
        const darkMode = localStorage.getItem('darkMode');
        const toggleBtn = document.getElementById('darkModeToggle');
        
        if (darkMode === 'true') {
            document.body.setAttribute('data-theme', 'dark');
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // Settings Modal
    async showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        // Load current settings
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const settings = await response.json();
                this.populateSettingsForm(settings);
                await this.updateConfigurationStatus(settings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        
        // Load logs
        await this.loadLogs();
        
        // Load version info
        await this.loadVersion();
        
        modal.style.display = 'block';
    }

    async updateConfigurationStatus(settings, testSuccessful = false) {
        const indicator = document.getElementById('configIndicator');
        const text = document.getElementById('configText');
        
        // If we just had a successful test, mark as configured
        if (testSuccessful) {
            indicator.className = 'config-indicator configured';
            text.textContent = 'Configured';
            return;
        }
        
        // For saved settings, check if we have the basic required fields
        // If we do, check the server status to see if it's actually configured
        const hasBasicConfig = settings.UNIFI_HOST && settings.UNIFI_PORT && settings.UNIFI_USERNAME;
        
        if (hasBasicConfig) {
            try {
                const response = await fetch('/api/status');
                const status = await response.json();
                
                if (status.connected) {
                    indicator.className = 'config-indicator configured';
                    text.textContent = 'Configured';
                } else if (status.error && status.error.includes('not configured')) {
                    indicator.className = 'config-indicator unconfigured';
                    text.textContent = 'Not Configured';
                } else {
                    // Has config but connection failed
                    indicator.className = 'config-indicator configured';
                    text.textContent = 'Configured (Connection Issue)';
                }
            } catch (error) {
                // Assume configured if we have basic settings but can't check status
                indicator.className = 'config-indicator configured';
                text.textContent = 'Configured';
            }
        } else {
            indicator.className = 'config-indicator unconfigured';
            text.textContent = 'Not Configured';
        }
    }

    closeSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    populateSettingsForm(settings) {
        // Only override defaults if actual values exist
        if (settings.UNIFI_HOST) document.getElementById('unifiHost').value = settings.UNIFI_HOST;
        if (settings.UNIFI_PORT) document.getElementById('unifiPort').value = settings.UNIFI_PORT;
        if (settings.UNIFI_USERNAME) document.getElementById('unifiUsername').value = settings.UNIFI_USERNAME;
        // Don't populate password for security
        document.getElementById('unifiPassword').value = '';
        if (settings.UNIFI_SITE) document.getElementById('unifiSite').value = settings.UNIFI_SITE;
        if (settings.PORT) document.getElementById('appPort').value = settings.PORT;
        if (settings.SCAN_INTERVAL) document.getElementById('scanInterval').value = settings.SCAN_INTERVAL;
    }

    async saveSettings() {
        const settings = {
            UNIFI_HOST: document.getElementById('unifiHost').value.trim(),
            UNIFI_PORT: document.getElementById('unifiPort').value.trim(),
            UNIFI_USERNAME: document.getElementById('unifiUsername').value.trim(),
            UNIFI_PASSWORD: document.getElementById('unifiPassword').value.trim(),
            UNIFI_SITE: document.getElementById('unifiSite').value.trim() || 'default',
            PORT: document.getElementById('appPort').value.trim(),
            SCAN_INTERVAL: document.getElementById('scanInterval').value.trim()
        };

        // Remove empty values (except password which should be sent if provided)
        Object.keys(settings).forEach(key => {
            if (key !== 'UNIFI_PASSWORD' && !settings[key]) {
                delete settings[key];
            }
        });

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.envFileCreated) {
                    this.showNotification('Configuration saved! .env file created successfully. Settings are now active.', 'success');
                } else {
                    this.showNotification('Settings updated successfully! Configuration is now active.', 'success');
                }
                this.closeSettingsModal();
                
                // Refresh status and try loading devices
                setTimeout(() => {
                    this.checkStatus();
                    this.loadDevices();
                }, 1000);
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showError('Failed to save settings: ' + error.message);
        }
    }

    async testSettings() {
        const testBtn = document.getElementById('testSettingsBtn');
        const originalText = testBtn.innerHTML;
        
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        testBtn.disabled = true;

        const passwordField = document.getElementById('unifiPassword').value.trim();
        
        // If password field is empty, we need to check if there's a saved password
        if (!passwordField) {
            this.showNotification('Please enter your password to test the connection', 'warning');
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            return;
        }

        const settings = {
            UNIFI_HOST: document.getElementById('unifiHost').value.trim(),
            UNIFI_PORT: document.getElementById('unifiPort').value.trim(),
            UNIFI_USERNAME: document.getElementById('unifiUsername').value.trim(),
            UNIFI_PASSWORD: passwordField,
            UNIFI_SITE: document.getElementById('unifiSite').value.trim() || 'default'
        };

        try {
            const response = await fetch('/api/test-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Settings test successful!', 'success');
                // Update configuration status to show it's working
                await this.updateConfigurationStatus(settings, true);
            } else {
                this.showNotification('Settings test failed: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error testing settings:', error);
            this.showError('Failed to test settings: ' + error.message);
        } finally {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }
    }

    async loadLogs() {
        const logsContent = document.getElementById('logsContent');
        logsContent.innerHTML = '<div class="loading-logs">Loading logs...</div>';

        try {
            const response = await fetch('/api/logs');
            if (response.ok) {
                const logs = await response.json();
                this.displayLogs(logs);
            } else {
                logsContent.innerHTML = '<div class="loading-logs">Failed to load logs</div>';
            }
        } catch (error) {
            console.error('Error loading logs:', error);
            logsContent.innerHTML = '<div class="loading-logs">Error loading logs</div>';
        }
    }

    displayLogs(logs) {
        const logsContent = document.getElementById('logsContent');
        
        if (!logs || logs.length === 0) {
            logsContent.innerHTML = '<div class="loading-logs">No logs available</div>';
            return;
        }

        const logEntries = logs.map(log => `
            <div class="log-entry">
                <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');

        logsContent.innerHTML = logEntries;
    }

    // Diagnostics Accordion Toggle
    toggleDiagnostics() {
        const header = document.getElementById('diagnosticsToggle');
        const content = document.getElementById('diagnosticsContent');
        const icon = header.querySelector('.accordion-icon');
        
        const isActive = content.classList.contains('active');
        
        if (isActive) {
            content.classList.remove('active');
            header.classList.remove('active');
            icon.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('active');
            header.classList.add('active');
            icon.style.transform = 'rotate(180deg)';
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new UniFiSentinel();
});