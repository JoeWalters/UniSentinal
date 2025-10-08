# UniFi Sentinel - Dream Machine Device Monitor

A web application that monitors your UniFi Dream Machine Special Edition for new device connections and provides an interface to acknowledge and track them.

## Features

- **Real-time Device Monitoring**: Automatically detects new devices connecting to your UniFi network
- **Acknowledgment System**: Mark devices as reviewed so they don't appear again
- **Detailed Device Information**: View comprehensive details about each detected device
- **Modern Web Interface**: Clean, responsive design with real-time updates
- **Persistent Storage**: SQLite database to track devices and acknowledgment status
- **Auto-refresh**: Continuous monitoring with configurable scan intervals

## Prerequisites

- Node.js (version 14 or higher)
- UniFi Dream Machine Special Edition with API access
- Network access to your UniFi controller

## Installation

### Option 1: Docker (Recommended)

1. **Pull the latest image**:
   ```bash
   docker pull ghcr.io/joewalters/unisentinal:latest
   ```

2. **Run with Docker**:
   ```bash
   docker run -d \
     --name unisentinal \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     -e UNIFI_HOST=192.168.1.1 \
     -e UNIFI_USERNAME=admin \
     -e UNIFI_PASSWORD=your_password \
     ghcr.io/joewalters/unisentinal:latest
   ```

3. **Or use Docker Compose**:
   ```bash
   # Download docker-compose.yml from the repository
   curl -O https://raw.githubusercontent.com/JoeWalters/UniSentinal/main/docker-compose.yml
   
   # Set environment variables
   export UNIFI_HOST=192.168.1.1
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
   UNIFI_HOST=192.168.1.1          # Your Dream Machine IP address
   UNIFI_PORT=443                  # Usually 443 for HTTPS
   UNIFI_USERNAME=admin            # Your UniFi admin username
   UNIFI_PASSWORD=your_password    # Your UniFi admin password
   UNIFI_SITE=default              # Usually 'default' unless you have multiple sites
   
   # Web Server Configuration
   PORT=3000                       # Port for the web interface
   NODE_ENV=development
   
   # Database
   DB_PATH=./data/devices.db       # SQLite database location
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

## Docker

### Available Tags
- `latest` - Latest stable release
- `YYYYMMDDHHMMSS` - Timestamp-based builds (e.g., `20240308120000`)
- `1.0.0-YYYYMMDDHHMMSS` - Version with timestamp (e.g., `1.0.0-20240308120000`)

### Environment Variables for Docker
```bash
# Required
UNIFI_HOST=192.168.1.1          # Your UniFi controller IP
UNIFI_USERNAME=admin            # UniFi admin username  
UNIFI_PASSWORD=your_password    # UniFi admin password

# Optional
UNIFI_PORT=443                  # Default: 443
UNIFI_SITE=default              # Default: default
PORT=3000                       # Default: 3000
NODE_ENV=production             # Default: production
```

### Building from Source
```bash
# Clone and build
git clone https://github.com/JoeWalters/UniSentinal.git
cd UniSentinal
docker build -t unisentinal .

# Run your custom build
docker run -d --name unisentinal -p 3000:3000 unisentinal
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

## File Structure

```
UniSentinal/
├── server.js                      # Main Express server
├── package.json                   # Dependencies and scripts
├── .env                          # Environment configuration (create from .env.example)
├── data/                         # SQLite database storage
│   └── devices.db               # Automatically created
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

## Configuration Options

### Scan Interval
The default scan interval is 30 seconds. To modify this, edit the `setInterval` value in `server.js`:

```javascript
// Change from 30000 (30 seconds) to your preferred interval
setInterval(async () => {
    // ... scanning logic
}, 30000);
```

### Database Location
The SQLite database is stored in `./data/devices.db` by default. Change the `DB_PATH` environment variable to use a different location.

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
   - Ensure the `data/` directory exists and is writable
   - Delete `data/devices.db` to reset the database

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