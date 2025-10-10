#!/bin/bash

# Test alternative UniFi API endpoints for blocking in 9.4.19
API_URL="http://192.168.0.74:8003"

echo "🔬 Testing Alternative UniFi 9.4.19 Blocking APIs"
echo "==============================================="

echo "✅ Confirmed: Manual blocking works via mobile app"
echo "❌ Problem: API endpoint /cmd/stamgr returns 403"
echo

# Since we know J_XBOX_Jazmin can be blocked manually, let's use that for testing
TEST_MAC="b8:31:b5:1d:8d:e2"
echo "🎯 Testing with: $TEST_MAC (J_XBOX_Jazmin - confirmed working manually)"
echo

echo "📋 Current device status:"
curl -s "$API_URL/api/parental/devices/managed" | jq ".[] | select(.mac == \"$TEST_MAC\") | {device_name, mac, is_blocked, isOnline}"
echo

echo "🔍 Research: UniFi 9.4.19 API Changes"
echo "====================================="

echo "Possible reasons for 403 with working manual blocking:"
echo "1️⃣ API endpoint path changed (e.g., /cmd/sta-mgr instead of /cmd/stamgr)"
echo "2️⃣ Command format changed (e.g., 'block_sta' instead of 'block-sta')"
echo "3️⃣ Additional parameters required in 9.4.19"
echo "4️⃣ API requires different authentication method"
echo "5️⃣ Dream Machine uses different endpoints than regular controllers"
echo

echo "💡 Investigation needed:"
echo "• Check UniFi 9.4.19 API documentation"
echo "• Compare Dream Machine API vs regular controller API"
echo "• Test if other management commands work (e.g., forget-sta)"
echo

echo "🔧 Temporary workaround options:"
echo "• Use UniFi's built-in client blocking rules instead of API"
echo "• Create firewall rules that can be toggled via API"
echo "• Use VLAN changes instead of device blocking"
echo

echo "📱 Since mobile app works, the question is:"
echo "What API does the mobile app use that's different from /cmd/stamgr?"