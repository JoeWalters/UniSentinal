# UniFi Sentinel - Advanced Network Device Management

A comprehensive web application for monitoring UniFi networks with advanced parental controls, device management, and security features. Go beyond basic device detection with Google Family Link-style controls, real-time blocking, scheduling, and enterprise-grade credential security.

## 🚀 Key Features

### 📱 **Comprehensive Parental Controls**
- **Google Family Link-style Interface**: Intuitive device management with visual status indicators
- **Real-time Device Blocking**: Instantly block/unblock devices with visual feedback
- **Time Limits & Scheduling**: Set daily time limits, bonus time, and custom schedules
- **Visual Status Indicators**: Color-coded cards showing blocked (red) vs allowed (green) devices
- **Online/Offline Tracking**: Live status with pulsing indicators for active devices

### 🎯 **Advanced Device Management**
- **Real-time Device Monitoring**: Automatically detects new devices connecting to your UniFi network
- **Smart Device Filtering**: Filter by online status, device type, and management status
- **Detailed Device Information**: Comprehensive details including vendor, MAC, IP, and connection history
- **Device Acknowledgment**: Mark devices as reviewed with persistent tracking
- **UniFi Integration**: Direct communication with UniFi controllers for real-time status

### 🔒 **Enterprise Security**
- **Encrypted Credential Storage**: AES-256-CBC encryption for all passwords and sensitive data
- **Secure Key Management**: Automatic key generation with restricted file permissions
- **No Plain Text Passwords**: All credentials encrypted at rest in configuration files
- **API Security**: No credential exposure in API responses with secure session handling
- **Content Security Policy**: CSP-compliant code preventing security vulnerabilities

### 🎨 **Modern User Experience**
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Dark/Light Mode**: Toggle between themes with persistent preference
- **Real-time Updates**: Live data refresh with auto-polling
- **Interactive Notifications**: Toast messages for all user actions with success/error feedback
- **Tab-based Navigation**: Organized interface with smooth transitions

### ⚙️ **Easy Configuration**
- **Web-Based Setup**: Complete configuration through the web interface - no file editing required
- **Connection Testing**: Built-in diagnostics to verify UniFi controller connectivity
- **Auto-Discovery**: Automatic detection of UniFi controller capabilities
- **Backup & Restore**: Configuration export/import for easy migration

## 📋 Prerequisites

- **UniFi Controller**: Dream Machine, Cloud Key, or self-hosted UniFi Network Application
- **UniFi OS**: Version 1.8+ or UniFi Network Application 6.0+
- **Admin Access**: UniFi admin credentials with device management permissions
- **Network Access**: Connectivity to your UniFi controller from the application
- **Node.js**: Version 16+ (for manual installation) or Docker (recommended)
- **Browsers**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+

## 🚀 Quick Start

### Option 1: Docker (Recommended)

**🔐 Secure Installation with Encrypted Credentials**

1. **Pull the latest image**:
   ```bash
   docker pull joewalters/unisentinal:latest
   ```

2. **Run with persistent data**:
   ```bash
   docker run -d \
     --name unisentinal \
     -p 3000:3000 \
     -v $(pwd)/config:/config \
     --restart unless-stopped \
     joewalters/unisentinal:latest
   ```

3. **Configure via Web Interface** (Recommended):
   - Open http://localhost:3000
   - Click the Settings (⚙️) button
   - Enter your UniFi credentials (automatically encrypted)
   - Test connection and save

4. **Or use environment variables**:
   ```bash
   docker run -d \
     --name unisentinal \
     -p 3000:3000 \
     -v $(pwd)/config:/config \
     -e UNIFI_HOST=192.168.1.1 \
     -e UNIFI_USERNAME=admin \
     -e UNIFI_PASSWORD=your_password \
     --restart unless-stopped \
     joewalters/unisentinal:latest
   ```

### Option 2: Docker Compose

```yaml
version: '3.8'
services:
  unisentinal:
    image: joewalters/unisentinal:latest
    container_name: unisentinal
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
    environment:
      - UNIFI_HOST=192.168.1.1
      - UNIFI_USERNAME=admin
      - UNIFI_PASSWORD=your_password
    restart: unless-stopped
```

### Option 3: Unraid Community Applications

**Template Available**: Search for "UniSentinal" in Community Applications

**Manual Setup**:
- **Repository**: `joewalters/unisentinal:latest`
- **Network Type**: Bridge
- **WebUI Port**: `3000:3000`
- **Data Volume**: `/mnt/user/appdata/unisentinal:/config`
- **Environment Variables**:
  - `UNIFI_HOST`: Your UniFi controller IP
  - `UNIFI_USERNAME`: Admin username  
  - `UNIFI_PASSWORD`: Admin password (automatically encrypted)
   export UNIFI_USERNAME=admin
   export UNIFI_PASSWORD=your_password
   
   # Start the service
   docker-compose up -d
   ```

### Option 2: Manual Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd UniSentinal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   copy .env.example .env
   ```
   
   Edit the `.env` file with your UniFi controller details:
   ```env
   # UniFi Controller Configuration
   UNIFI_HOST=192.168.0.1          # Your Dream Machine IP address
   UNIFI_PORT=443                  # Usually 443 for HTTPS
   UNIFI_USERNAME=admin            # Your UniFi admin username
   UNIFI_PASSWORD=your_password    # Your UniFi admin password
   UNIFI_SITE=default              # Usually 'default' unless you have multiple sites
   
   # Web Server Configuration
   PORT=3000                       # Port for the web interface
   NODE_ENV=development
   
   # Data Storage Configuration
   # CONFIG_DIR is the base directory for all persistent data (settings, database, logs)
   # This should be mounted as a volume in Docker/Unraid
   CONFIG_DIR=/config
   
   # Database path (relative to CONFIG_DIR if not absolute)
   # DB_PATH=/config/devices.db  # Will default to CONFIG_DIR/devices.db if not specified
   ```

## 🎯 Usage Guide

### Initial Setup

1. **Access the Web Interface**:
   ```
   http://localhost:3000
   ```

2. **Configure UniFi Connection**:
   - Click the Settings (⚙️) button in the top-right
   - Enter your UniFi controller details:
     - **Host**: Your controller IP (e.g., `192.168.1.1`)
     - **Username**: Admin username
     - **Password**: Admin password (automatically encrypted)
     - **Port**: Usually `443` for HTTPS
     - **Site**: Usually `default`
   - Click "Test Settings" to verify connection
   - Click "Save Settings" to apply

3. **Explore the Interface**:
   - **Dashboard**: Overview of network devices and new connections
   - **Parental Controls**: Manage device blocking, time limits, and schedules
   - **Settings**: Configuration and diagnostics

### Parental Controls

#### 📱 **Managing Devices**

1. **View Available Devices**:
   - Navigate to the "Parental Controls" tab
   - See all network devices with filtering options
   - Use filters: Online/Offline, Device Type, Status

2. **Add Device to Controls**:
   - Click "Add to Controls" on any device
   - Device moves to the "Managed Devices" section
   - Immediately available for blocking/scheduling

3. **Block/Unblock Devices**:
   - **Visual Status**: Red cards = blocked, Green cards = allowed
   - **One-Click Control**: Click "Block" or "Unblock" buttons
   - **Real-time Feedback**: Loading states and success notifications
   - **Status Sync**: Automatically syncs with UniFi controller

#### ⏰ **Time Management**

1. **Set Daily Time Limits**:
   - Click "Manage" on any controlled device
   - Set daily time allowance (e.g., 2 hours)
   - Add bonus time for special occasions
   - Device automatically blocks when time expires

2. **Create Schedules**:
   - Define blocked time periods by day
   - Example: Block 10 PM - 6 AM on school nights
   - Flexible scheduling with multiple time windows
   - Visual schedule builder interface

#### 🎨 **Visual Indicators**

- **🟢 Green Cards**: Device is allowed and can access internet
- **🔴 Red Cards**: Device is blocked from internet access
- **🟢 Pulsing Dot**: Device is currently online
- **⚫ Gray Dot**: Device is offline
- **Time Displays**: 
  - Green: Unlimited time
  - Orange: Limited time remaining
  - Red: Time expired (auto-blocked)

## How It Works

### Device Detection
- The application polls your UniFi controller every 30 seconds
- It compares the current device list with previously seen devices
- New devices are automatically added to the database as "unacknowledged"

### Acknowledgment System
- Unacknowledged devices appear in the web interface
- Click "Acknowledge" on individual devices or "Acknowledge All" for bulk operations
- Acknowledged devices are marked in the database and won't appear again
- The acknowledgment status persists between application restarts

### Data Collected
For each device, the system tracks:
- MAC address (unique identifier)
- IP address
- Hostname/device name
- Vendor information (from MAC OUI lookup)
- Connection type (wired/wireless)
- Network details (SSID, access point)
- Traffic statistics (bytes sent/received)
- First and last seen timestamps
- Detection timestamp by Sentinel

## 🐳 Docker

### Quick Start
```bash
# Basic run (data will be lost when container is removed)
docker run -p 3000:3000 joewalters/unisentinal:latest

# With persistent data
docker run -d -p 3000:3000 -v ./config:/config joewalters/unisentinal:latest
```

### Available Tags
- `latest` - Most recent stable version
- `YYYYMMDDHHMMSS` - Timestamped versions (e.g., `20251008142658`)

### Docker Hub
Images are automatically built and published to Docker Hub: https://hub.docker.com/r/joewalters/unisentinal

### Environment Variables for Docker
```bash
# Required
UNIFI_HOST=192.168.0.1          # Your UniFi controller IP
UNIFI_USERNAME=admin            # UniFi admin username  
UNIFI_PASSWORD=your_password    # UniFi admin password

# Optional
UNIFI_PORT=443                  # Default: 443
UNIFI_SITE=default              # Default: default
PORT=3000                       # Default: 3000
NODE_ENV=production             # Default: production
CONFIG_DIR=/config              # Default: /config (persistent data directory)
```

### Full Docker Run Example
```bash
docker run -d \
  --name unisentinal \
  -p 3000:3000 \
  -v $(pwd)/config:/config \
  -e UNIFI_HOST=192.168.0.1 \
  -e UNIFI_USERNAME=admin \
  -e UNIFI_PASSWORD=your_password \
  joewalters/unisentinal:latest
```

### Unraid Setup
For Unraid users, all persistent data (database, settings, logs) is stored in `/config`:

**Community Applications Template:**
- Repository: `joewalters/unisentinal:latest`
- Network Type: `Bridge`
- Port: `3000:3000`  
- Volume: `/mnt/user/appdata/unisentinal:/config`
- Required Variables:
  - `UNIFI_HOST`: Your Dream Machine IP (e.g., `192.168.0.1`)
  - `UNIFI_USERNAME`: Admin username
  - `UNIFI_PASSWORD`: Admin password

**Manual Unraid Docker Command:**
```bash
docker run -d \
  --name=UniSentinal \
  -p 3000:3000 \
  -v /mnt/user/appdata/unisentinal:/config \
  -e UNIFI_HOST=192.168.0.1 \
  -e UNIFI_USERNAME=admin \
  -e UNIFI_PASSWORD=your_password \
  --restart=unless-stopped \
  joewalters/unisentinal:latest
```

The `/mnt/user/appdata/unisentinal` directory will contain:
- `.env` - Active configuration file (auto-generated from web settings)
- `.env.example` - Template/reference file with all available options
- `devices.db` - SQLite database with device tracking data
- Future config files and logs

### Building from Source
```bash
# Clone and build
git clone https://github.com/JoeWalters/UniSentinal.git
cd UniSentinal
docker build -t unisentinal .

# Run your custom build
docker run -d --name unisentinal -p 3000:3000 -v ./config:/config unisentinal
```

### Version Information
The Docker images include build metadata and version information accessible via:
- `/api/version` endpoint
- Web interface footer and settings modal
- Docker labels for image metadata

## 🔌 API Endpoints

### **Device Management**
- `GET /api/devices` - Get unacknowledged devices
- `POST /api/devices/:mac/acknowledge` - Acknowledge a specific device
- `GET /api/scan` - Trigger manual device scan

### **Parental Controls**
- `GET /api/parental/devices/available` - Get all network devices for parental control
- `GET /api/parental/devices/managed` - Get devices currently under parental control
- `POST /api/parental/devices/add` - Add device to parental controls
- `DELETE /api/parental/devices/:mac` - Remove device from parental controls
- `POST /api/parental/devices/:mac/block` - Block device internet access
- `POST /api/parental/devices/:mac/unblock` - Unblock device internet access
- `POST /api/parental/devices/:mac/time-limit` - Set daily time limits
- `POST /api/parental/devices/:mac/schedule` - Configure access schedules
- `GET /api/parental/logs/:mac?` - Get parental control activity logs

### **System & Configuration**
- `GET /api/status` - Check UniFi controller connection status
- `GET /api/diagnostics` - Run comprehensive system diagnostics
- `GET /api/version` - Get application version and build information
- `GET /api/settings` - Get current configuration (passwords not exposed)
- `POST /api/settings` - Update configuration (passwords automatically encrypted)
- `POST /api/test-settings` - Test configuration without saving

### **API Security**
- 🔒 **No Credential Exposure**: Passwords never returned in API responses
- 🛡️ **Input Validation**: All inputs validated and sanitized
- 📝 **Audit Logging**: All API calls logged without sensitive data
- 🔐 **Secure Sessions**: Proper session management for web interface

## 📁 Project Structure

```
UniSentinal/
├── server.js                              # Main Express server with all API endpoints
├── package.json                           # Dependencies and build scripts
├── Dockerfile                             # Docker container configuration
├── docker-compose.yml                     # Multi-container orchestration
├── config/                                # 🔒 Persistent data (Docker volume mount)
│   ├── .env                              # 🔐 Encrypted configuration file
│   ├── .key                              # 🗝️ Master encryption key (restricted access)
│   └── devices.db                        # 📊 SQLite database with all device data
├── public/                                # 🎨 Frontend application
│   ├── index.html                        # Main web interface with tab navigation
│   ├── styles.css                        # Responsive CSS with dark/light themes
│   ├── app.js                            # JavaScript app with parental controls
│   └── version.json                      # Build version information
├── src/                                   # 🏗️ Backend modules
│   ├── controllers/
│   │   ├── UnifiController.js            # UniFi API integration with authentication
│   │   └── ParentalControlsManager.js    # Device blocking and time management
│   ├── database/
│   │   └── DatabaseManager.js            # SQLite operations with async/await
│   └── utils/
│       ├── Logger.js                     # Application logging system
│       └── CredentialManager.js          # 🔒 AES-256 credential encryption
└── logs/                                  # 📝 Application logs (auto-created)
    └── app.log                           # Rotating log files
```

### **Security Architecture**
- 🔐 **config/.env**: Settings with encrypted passwords
- 🗝️ **config/.key**: Master encryption key (0o600 permissions)
- 📁 **config/**: Directory with restricted access (0o700 permissions)
- 🛡️ **No plain text**: All sensitive data encrypted at rest

## Configuration

### Web-Based Configuration
The easiest way to configure UniSentinal is through the web interface:
1. Access the web interface at `http://localhost:3000`
2. Click the settings button (⚙️) in the top-right corner
3. Enter your UniFi controller details:
   - **Host**: Your Dream Machine IP (e.g., `192.168.0.1`)
   - **Username**: Admin username
   - **Password**: Admin password
   - **Port**: Usually `443` (HTTPS)
   - **Site**: Usually `default`
4. Click "Test Settings" to verify connection
5. Click "Save Settings" to apply

Settings are automatically saved to the configuration file and persist between restarts.

### Environment Variables
You can also configure via environment variables (useful for Docker):
- `UNIFI_HOST` - UniFi controller IP address
- `UNIFI_USERNAME` - Admin username  
- `UNIFI_PASSWORD` - Admin password
- `UNIFI_PORT` - Controller port (default: 443)
- `UNIFI_SITE` - Site name (default: default)
- `PORT` - Web interface port (default: 3000)
- `CONFIG_DIR` - Data directory (default: /config)

### Configuration Priority
1. **Environment Variables** (highest priority)
2. **Web Interface Settings** (saved to .env file)
3. **Default Values** (lowest priority)

## Configuration Options

### Scan Interval
The default scan interval is 30 seconds. To modify this, edit the `setInterval` value in `server.js`:

```javascript
// Change from 30000 (30 seconds) to your preferred interval
setInterval(async () => {
    // ... scanning logic
}, 30000);
```

### Data Storage Location
All persistent data (database, settings) is stored in the `/config` directory by default. This makes it easy to mount as a volume in Docker/Unraid:
- **Database**: `/config/devices.db` 
- **Settings**: `/config/.env`
- **Custom Path**: Set `CONFIG_DIR` environment variable to change the base directory

## 🆚 Feature Comparison

| Feature | Basic Router Admin | UniFi Network App | UniSentinal |
|---------|------------------|-------------------|-------------|
| Device Detection | ❌ Manual only | ✅ Automatic | ✅ Real-time with notifications |
| Device Blocking | ⚠️ Complex setup | ✅ Basic blocking | ✅ One-click with visual feedback |
| Time Limits | ❌ Not available | ❌ Not available | ✅ Daily limits + bonus time |
| Scheduling | ❌ Not available | ⚠️ Basic profiles | ✅ Flexible per-device schedules |
| Visual Interface | ❌ Technical UI | ⚠️ Network-focused | ✅ Family-friendly with status colors |
| Real-time Status | ❌ Manual refresh | ⚠️ Polling required | ✅ Live updates with animations |
| Security | ❌ Plain text configs | ⚠️ Local storage only | ✅ AES-256 encrypted credentials |
| Mobile Friendly | ❌ Desktop only | ⚠️ Limited mobile | ✅ Fully responsive design |
| API Integration | ❌ Not available | ⚠️ Complex API | ✅ RESTful API with documentation |

## 🔧 Troubleshooting

### **UniFi Connection Issues**

#### **Authentication Problems**
```bash
# Check connection with diagnostics
GET /api/diagnostics

# Common solutions:
✅ Verify IP address is reachable
✅ Test credentials in UniFi web interface  
✅ Ensure user has admin privileges
✅ Use local account (not SSO/cloud account)
✅ Check if 2FA is enabled (may cause issues)
```

#### **Network Connectivity**
```bash
# Test from container/application host:
ping 192.168.1.1        # Test basic connectivity
curl -k https://192.168.1.1:443/api  # Test HTTPS access

# Docker networking issues:
docker run --network host ...  # Use host networking for testing
```

#### **SSL Certificate Issues**
- ✅ Self-signed certificates are automatically accepted
- ✅ Certificate validation is disabled for UniFi controllers
- ⚠️ Ensure port 443 (HTTPS) is used, not port 80

### **Art of WiFi Library Issues**

#### **Diagnostics Failing After Migration**
```bash
# Test the Art of WiFi integration directly:
node test-unifi.js

# Common issues and solutions:
✅ Site parameter must be correct (default: 'default')
✅ Controller callback patterns changed from axios
✅ Data format may be different (array vs object with .data property)
✅ Error handling changed - check error.message structure

# Expected data format with Art of WiFi:
# Option 1: Array returned directly
data = [client1, client2, ...]

# Option 2: Object with data property  
data = { data: [client1, client2, ...], meta: {...} }
```

#### **Connection Test Endpoint**
```bash
# Use the new connection test endpoint:
GET /api/test-connection

# This tests login without data access
# Helps isolate authentication vs data retrieval issues
```

#### **Callback Error Patterns**
```javascript
// Art of WiFi error patterns:
error.message contains:
- "Authentication failed" → Bad credentials
- "ECONNREFUSED" → Controller unreachable
- "ENOTFOUND" → DNS/hostname issue
- "403" → Insufficient permissions
- "Failed to get clients" → Data access issue
```

### **Parental Control Issues**

#### **Devices Not Blocking**
1. **Check UniFi Permissions**:
   - User must have "Device Management" permissions
   - Test blocking directly in UniFi interface first

2. **Verify Device Status**:
   - Device must be online to receive block commands
   - Check real-time status with pulsing indicators
   - Some devices cache connections for 5-10 minutes

3. **Network Configuration**:
   - Blocking works at router level (not DNS)
   - VPN connections may bypass blocks
   - Guest networks may have different rules

#### **Time Limits Not Working**
- ✅ Ensure device clock is synchronized
- ✅ Check timezone settings in UniFi controller
- ✅ Verify time limit is greater than 0
- ✅ Reset time usage if needed

### **Application Issues**

#### **Web Interface Problems**
```bash
# Clear browser data:
- Clear cookies and localStorage for http://localhost:3000
- Disable browser extensions
- Try incognito/private browsing mode

# Check browser console:
F12 → Console tab → Look for errors
```

#### **Docker/Container Issues**
```bash
# Check container logs:
docker logs unisentinal

# Verify volume mount:
docker exec unisentinal ls -la /config

# Check permissions:
docker exec unisentinal ls -la /config/.key
-rw------- 1 node node 32 Oct  9 12:34 .key  # Should be 0o600
```

#### **Database Problems**
```bash
# Reset database (⚠️ loses all data):
docker exec unisentinal rm /config/devices.db
docker restart unisentinal

# Check database integrity:
docker exec unisentinal sqlite3 /config/devices.db ".schema"
```

### **Performance Issues**

#### **Slow Loading**
- ✅ Check UniFi controller response time
- ✅ Reduce scan interval if network is slow
- ✅ Verify adequate system resources (CPU/RAM)

#### **High Resource Usage**
- ✅ Default scan interval: 30 seconds (adjust if needed)
- ✅ Large networks (100+ devices) may need longer intervals
- ✅ Database auto-vacuum runs weekly

### **Security Concerns**

#### **Credential Encryption Issues**
```bash
# Verify encryption is working:
cat config/.env | grep "encrypted:"

# Check key permissions:
ls -la config/.key  # Should be 0o600 (owner read/write only)

# Regenerate encryption key (re-encrypts all passwords):
rm config/.key && docker restart unisentinal
```

#### **File Permissions**
```bash
# Correct permissions:
chmod 700 config/           # Directory: owner only
chmod 600 config/.key       # Encryption key: owner read/write only
chmod 644 config/.env       # Config: owner write, all read
```

## 🔒 Security Features

### **Enterprise-Grade Credential Protection**

UniSentinal implements **AES-256-CBC encryption** for all sensitive credentials:

#### **Encrypted Storage**
```bash
# ❌ Before (Security Risk)
UNIFI_PASSWORD=myplainpassword123

# ✅ After (Secure)  
UNIFI_PASSWORD=encrypted:8LwkTYG4YC93YxFyR041ZP88wIljdCpY3sE2PKkt7ck=
```

#### **Automatic Security Features**
- 🔐 **Password Encryption**: All passwords automatically encrypted before storage
- 🗝️ **Secure Key Management**: 256-bit encryption keys with restricted file permissions
- 🛡️ **API Protection**: No credential exposure in web APIs or logs
- 🔄 **Key Rotation**: Support for encryption key rotation and re-encryption
- 📁 **File Permissions**: Restrictive permissions on key and config files

#### **Security Best Practices**
- 🌐 **HTTPS Deployment**: Run behind reverse proxy with SSL certificates
- 🔥 **Firewall Protection**: Limit network access to trusted users only
- 📦 **Container Security**: Run with non-root user in containerized environments
- 🔄 **Regular Updates**: Keep dependencies updated for security patches
- 📝 **Audit Logging**: Comprehensive logging without credential exposure

### **Migration & Compatibility**
- ✅ **Automatic Upgrade**: Existing plain text passwords automatically encrypted
- ✅ **Zero Downtime**: No disruption during security upgrade
- ✅ **Backwards Compatible**: Works with existing configurations
- ✅ **Key Recovery**: Backup and restore procedures for encryption keys

## Development

To contribute or modify the application:

1. **Install development dependencies**:
   ```bash
   npm install
   ```

2. **Run in development mode**:
   ```bash
   npm run dev
   ```

3. **Code Structure**:
   - Backend: Express.js server with modular controllers
   - Database: SQLite with async/await patterns
   - Frontend: Vanilla JavaScript with modern ES6+ features
   - API: RESTful design with JSON responses

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🚧 Development & Contributing

### **Development Setup**
```bash
# Clone and setup
git clone https://github.com/JoeWalters/UniSentinal.git
cd UniSentinal
npm install

# Run in development mode
CONFIG_DIR=./config npm run dev

# Access development server
open http://localhost:3000
```

### **Architecture Overview**
- **Backend**: Node.js + Express with RESTful API design
- **Database**: SQLite with async/await patterns and transactions
- **Frontend**: Vanilla JavaScript ES6+ with modern web APIs
- **Security**: AES-256-CBC encryption with secure key management
- **Deployment**: Docker-first with multi-platform support

### **Contributing Guidelines**
1. **Security First**: All credential handling must use CredentialManager
2. **Responsive Design**: All UI changes must work on mobile devices
3. **API Consistency**: Follow RESTful patterns with proper HTTP status codes
4. **Error Handling**: Comprehensive error handling with user-friendly messages
5. **Testing**: Test with real UniFi controllers when possible

## 🏆 What Makes UniSentinal Special

### **Beyond Basic Device Monitoring**
UniSentinal transforms your UniFi network into a **comprehensive family safety platform**:

- 🎯 **Google Family Link Experience**: Intuitive parental controls that parents actually want to use
- 🔒 **Enterprise Security**: Bank-level credential encryption with zero plain-text storage
- 🎨 **Visual Excellence**: Color-coded interfaces that make device status instantly clear
- ⚡ **Real-time Everything**: Live device status, instant blocking, immediate visual feedback
- 📱 **Mobile-First Design**: Perfect experience on phones, tablets, and desktops
- 🛠️ **Developer-Friendly**: RESTful APIs and comprehensive documentation

### **Perfect For**
- 👨‍👩‍👧‍👦 **Families**: Easy parental controls with time limits and scheduling
- 🏢 **Small Businesses**: Employee device management and access control
- 🏠 **Home Labs**: Network monitoring with advanced device insights
- 👨‍💻 **Network Admins**: Professional-grade tools with enterprise security
- 🔧 **Developers**: Clean APIs for custom integrations and automation

## 📞 Support & Community

### **Documentation & Help**
- 📚 **Complete API Documentation**: Built-in at `/api` endpoint
- 🔧 **Comprehensive Troubleshooting**: Covers all common scenarios
- 🎥 **Video Tutorials**: Available on project homepage
- 💬 **Community Forum**: GitHub Discussions for peer support

### **Getting Help**
1. **Check Documentation**: Review troubleshooting section above
2. **Run Diagnostics**: Use built-in `/api/diagnostics` endpoint
3. **Browser Console**: Check F12 console for detailed error messages
4. **GitHub Issues**: Report bugs with full diagnostic information
5. **Community**: Ask questions in GitHub Discussions

### **Professional Support**
For enterprise deployments, custom integrations, or priority support:
- 📧 **Contact**: Available through GitHub repository
- 🏢 **Enterprise Features**: Custom development and deployment assistance
- 🔒 **Security Audits**: Professional security reviews available
- 📋 **SLA Options**: Guaranteed response times for business-critical deployments

---

**Built with ❤️ for the UniFi community**

*UniSentinal: Where network monitoring meets family safety with enterprise-grade security.*