#!/bin/bash

# Test if UniFi blocking API endpoints have changed in version 9.4.19
API_URL="http://192.168.0.74:8003"

echo "🔬 UniFi 9.4.19 API Compatibility Test"
echo "====================================="

echo "🔍 Controller version info:"
curl -s "$API_URL/api/diagnostics" | jq '.controllerHealth.systemInfo[0] | {version, build, hostname}'
echo

echo "📋 Testing different API approaches:"
echo

# Get the list of actually blocked devices to see the format
echo "1️⃣ Checking currently blocked devices:"
MANAGED_DEVICES=$(curl -s "$API_URL/api/parental/devices/managed")
echo "$MANAGED_DEVICES" | jq '.[0] | {mac, device_name, is_blocked, isOnline}'
echo

# Let's see what other endpoints work
echo "2️⃣ Testing API endpoint variations:"
echo "Trying different MAC formats..."

# Test with uppercase MAC
echo "Testing uppercase MAC..."
curl -s -X POST "$API_URL/api/parental/devices/9C:2F:9D:5A:61:03/block" \
  -H "Content-Type: application/json" \
  -d '{"reason":"uppercase_test"}' | head -50
echo

# Test with a different device that's online
echo "3️⃣ Testing with Xbox device (might be online):"
curl -s -X POST "$API_URL/api/parental/devices/b8:31:b5:1d:8d:e2/block" \
  -H "Content-Type: application/json" \
  -d '{"reason":"xbox_test"}' | head -50
echo

echo "💡 Key Questions:"
echo "• Can you manually block J_Laptop in UniFi web interface?"
echo "• Do any devices show as 'blocked' in UniFi Network → Clients?"
echo "• Has blocking worked before, or is this the first attempt?"
echo "• Are there any error messages in UniFi controller logs?"