#!/bin/bash

# UniSentinal Docker Initialization Script
# This script ensures proper setup of the config directory for Unraid/Docker

CONFIG_DIR=${CONFIG_DIR:-/config}

echo "🚀 UniSentinal Starting..."
echo "📁 Config directory: $CONFIG_DIR"

# Ensure config directory exists and has proper permissions
if [ ! -d "$CONFIG_DIR" ]; then
    echo "📁 Creating config directory: $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
fi

# Set proper ownership and permissions (in case mounted volume has wrong permissions)
if [ "$(id -u)" = "0" ]; then
    # Running as root, fix permissions
    chown -R nodejs:nodejs "$CONFIG_DIR"
    chmod -R 755 "$CONFIG_DIR"
    echo "🔒 Set config directory ownership to nodejs user and permissions to 755"
else
    # Not running as root, check if we can write
    if [ ! -w "$CONFIG_DIR" ]; then
        echo "⚠️  Warning: Config directory is not writable by current user"
        echo "   This may cause issues saving settings via web interface"
        echo "   Config directory: $CONFIG_DIR"
        echo "   Current user: $(id -un)"
    else
        echo "✅ Config directory is writable"
    fi
fi

# Copy .env.example to config directory for reference
ENV_EXAMPLE="$CONFIG_DIR/.env.example"
if [ ! -f "$ENV_EXAMPLE" ] && [ -f "/app/.env.example" ]; then
    echo "📋 Copying .env.example to config directory for reference"
    cp "/app/.env.example" "$ENV_EXAMPLE"
    if [ "$(id -u)" = "0" ]; then
        chown nodejs:nodejs "$ENV_EXAMPLE"
    fi
fi

# Check if .env exists, if not create a basic one
ENV_FILE="$CONFIG_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "⚙️  Creating initial .env file"
    
    # Use .env.example as base if it exists, otherwise create minimal config
    if [ -f "$ENV_EXAMPLE" ]; then
        echo "📝 Using .env.example as template"
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        
        # Add a header comment to indicate it's active config
        sed -i '1i# UniSentinal Active Configuration\n# This file is used by the application. You can modify it directly or use the web interface.\n# Original template available in .env.example\n' "$ENV_FILE"
    else
        # Fallback: create minimal config
        cat > "$ENV_FILE" << EOF
# UniSentinal Configuration
# This file was auto-generated. You can modify it directly or use the web interface.

# UniFi Controller Configuration (REQUIRED)
# UNIFI_HOST=192.168.0.1
# UNIFI_USERNAME=admin
# UNIFI_PASSWORD=your_password

# Optional Settings
UNIFI_PORT=443
UNIFI_SITE=default
PORT=3000
NODE_ENV=production

# Data Storage
CONFIG_DIR=$CONFIG_DIR
EOF
    fi
    
    # Set proper ownership for the .env file
    if [ "$(id -u)" = "0" ]; then
        chown nodejs:nodejs "$ENV_FILE"
    fi
    
    echo "📝 Created initial configuration file: $ENV_FILE"
    echo "📋 Reference template available: $ENV_EXAMPLE"
    echo "⚠️  Please configure your UniFi settings via environment variables or web interface"
fi

echo "✅ Initialization complete"
echo "🌐 Starting UniSentinal on port ${PORT:-3000}"

# Switch to nodejs user if we're running as root
if [ "$(id -u)" = "0" ]; then
    echo "🔄 Switching to nodejs user"
    # Change to nodejs user and execute the command
    exec su-exec nodejs "$@"
else
    # Already running as nodejs user or another user
    exec "$@"
fi