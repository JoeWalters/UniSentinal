# UniFi Sentinel - Dream Machine Device Monitor

A web application that monitors your UniFi Dream Machine Special Edition for new device connections and provides an interface to acknowledge and track them.

## Features

- **Real-time Device Monitoring**: Automatically detects new devices connecting to your UniFi network
- **Acknowledgment System**: Mark devices as reviewed so they don't appear again
- **Detailed Device Information**: View comprehensive details about each detected device
- **Modern Web Interface**: Clean, responsive design with real-time updates
- **Web-Based Configuration**: Easy setup through the web interface - no file editing required
- **Persistent Storage**: SQLite database to track devices and acknowledgment status
- **Docker/Unraid Ready**: Single volume mount for all persistent data
- **Auto-refresh**: Continuous monitoring with configurable scan intervals
- **Version Tracking**: Built-in version display and update tracking

## Prerequisites

- Node.js (version 14 or higher)
- UniFi Dream Machine Special Edition with API access
- Network access to your UniFi controller

## Installation

### Option 1: Docker (Recommended)

1. **Pull the latest image**:
   ```bash
   docker pull joewalters/unisentinal:latest
   ```

2. **Run with Docker**:
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

3. **Or use Docker Compose**:
   ```bash
   # Download docker-compose.yml from the repository
   curl -O https://raw.githubusercontent.com/JoeWalters/UniSentinal/main/docker-compose.yml
   
   # Set environment variables
   export UNIFI_HOST=192.168.0.1
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

## Usage

1. **Start the application**:
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

2. **Access the web interface**:
   Open your browser and navigate to `http://localhost:3000`

3. **Initial Setup**:
   - **Web Configuration**: Use the settings button (⚙️) in the top-right to configure your UniFi controller connection
   - **Environment Variables**: Or set UNIFI_HOST, UNIFI_USERNAME, and UNIFI_PASSWORD environment variables
   - The application will automatically connect to your UniFi controller
   - It will establish a baseline of existing devices
   - New devices will be detected and added to the monitoring list

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

## API Endpoints

The application provides a REST API for integration:

- `GET /api/devices` - Get unacknowledged devices
- `POST /api/devices/:mac/acknowledge` - Acknowledge a specific device
- `GET /api/scan` - Trigger manual device scan
- `GET /api/status` - Check UniFi controller connection status
- `GET /api/version` - Get application version and build information
- `GET /api/settings` - Get current configuration settings
- `POST /api/settings` - Update configuration settings

## File Structure

```
UniSentinal/
├── server.js                      # Main Express server
├── package.json                   # Dependencies and scripts
├── .env                          # Environment configuration (create from .env.example)
├── config/                       # Persistent data directory (Docker volume mount)
│   ├── .env                     # Active configuration file (auto-generated)
│   ├── .env.example             # Template file with all available options
│   └── devices.db               # SQLite database (automatically created)
├── public/                       # Frontend files
│   ├── index.html              # Main web interface
│   ├── styles.css              # Styling
│   └── app.js                  # Frontend JavaScript
└── src/
    ├── controllers/
    │   └── UnifiController.js   # UniFi API integration
    └── database/
        └── DatabaseManager.js   # SQLite database operations
```

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

## Troubleshooting

### Connection Issues
1. **Verify UniFi Controller Access**:
   - Ensure your Dream Machine is accessible at the configured IP
   - Test login credentials in the UniFi web interface
   - Check that the API is enabled (usually enabled by default)

2. **SSL Certificate Issues**:
   - The application ignores SSL certificate validation for self-signed certificates
   - If you encounter SSL issues, ensure the UNIFI_PORT is correct (usually 443)

3. **Authentication Problems**:
   - Verify username and password in `.env` file
   - Ensure the user has admin privileges
   - Some UniFi versions require local account (not SSO)

### Application Issues
1. **Port Already in Use**:
   - Change the PORT value in `.env` to use a different port
   - Or stop any other application using port 3000

2. **Database Errors**:
   - Ensure the `/config/` directory exists and is writable
   - Delete `/config/devices.db` to reset the database
   - Check that the Docker volume is properly mounted

3. **No Devices Detected**:
   - Check the browser console for error messages
   - Verify the UniFi controller status in the web interface
   - Trigger a manual scan to test connectivity

## Security Considerations

- Store your `.env` file securely and never commit it to version control
- Consider running the application behind a reverse proxy with HTTPS
- Limit network access to the application to trusted users
- Regularly update dependencies for security patches

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

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the browser console for error messages
3. Verify UniFi controller connectivity and credentials
4. Ensure all dependencies are properly installed