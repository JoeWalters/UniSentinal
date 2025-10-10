#!/bin/bash

# UniFi Permission Diagnostic Script for Docker Deployment
# Run this after configuring your UniFi controller credentials

echo "🔍 UniFi Permission Diagnostic Tool (Docker Version)"
echo "===================================================="

# Detect the API URL based on environment
API_URL="http://localhost:3000"

# Check if we can access the API
echo "🔌 Testing API connectivity..."
VERSION_TEST=$(curl -s --connect-timeout 5 "$API_URL/api/version" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$VERSION_TEST" ]; then
    echo "❌ Cannot connect to UniSentinal API at $API_URL"
    echo
    echo "🐳 Docker troubleshooting:"
    echo "   • Check if your Docker container is running:"
    echo "     docker ps | grep unisentinal"
    echo
    echo "   • Check container logs:"
    echo "     docker logs <container_name>"
    echo
    echo "   • Verify port mapping (should see 3000:3000):"
    echo "     docker port <container_name>"
    echo
    echo "   • If running on a different host/port, set API_URL:"
    echo "     API_URL=http://your-server-ip:3000 ./test-permissions.sh"
    echo
    exit 1
fi

echo "✅ API connectivity successful"
echo "📱 Version: $(echo "$VERSION_TEST" | jq -r '.version // .packageVersion // "unknown"' 2>/dev/null)"
echo

# Test basic permissions
echo "📋 Checking user permissions..."
PERMISSIONS=$(curl -s "$API_URL/api/permissions")
echo "$PERMISSIONS" | jq '.' 2>/dev/null || echo "$PERMISSIONS"
echo

# Test device blocking capability
echo "🚫 Testing device blocking capability..."
BLOCKING_TEST=$(curl -s "$API_URL/api/permissions/test-blocking")
echo "$BLOCKING_TEST" | jq '.' 2>/dev/null || echo "$BLOCKING_TEST"
echo

echo "📊 Diagnostic complete!"
echo

# Analyze results
if echo "$PERMISSIONS" | grep -q '"success":true' 2>/dev/null; then
    CAN_MANAGE=$(echo "$PERMISSIONS" | jq -r '.canManageDevices // false' 2>/dev/null)
    if [ "$CAN_MANAGE" = "true" ]; then
        echo "✅ Permission check: Account appears to have device management permissions"
    else
        echo "⚠️  Permission check: Account may not have sufficient permissions"
    fi
else
    echo "❌ Permission check failed - UniFi controller may not be configured"
fi

echo
echo "💡 If you see 403 errors when blocking devices:"
echo "   1. Check the 'canManageDevices' field above"
echo "   2. Look at the 'details' section for specific permission info"
echo "   3. The blocking test simulates a block request to test permissions"
echo
echo "🔧 Common fixes for 403 errors:"
echo "   • Verify UniFi admin account has 'Full Management' role"
echo "   • Check if UniFi is in read-only or maintenance mode"
echo "   • Ensure the site name in settings matches your UniFi site"
echo "   • Try creating a new local admin account in UniFi"
echo
echo "🐳 Docker-specific troubleshooting:"
echo "   • Check container environment variables are set correctly"
echo "   • Verify UniFi controller is accessible from container network"
echo "   • Check container logs: docker logs <container_name>"
echo "   • Ensure UNIFI_HOST points to correct IP from container perspective"