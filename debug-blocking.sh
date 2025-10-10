#!/bin/bash

# Debug UniFi API blocking with detailed logging
API_URL="http://192.168.0.74:8003"

echo "🔍 UniFi API Blocking Debug with Super Admin"
echo "==========================================="

echo "👤 Current user:"
curl -s "$API_URL/api/diagnostics" | jq '.authentication'
echo

echo "📱 Testing with device: 9c:2f:9d:5a:61:03 (J_Laptop)"
echo

# Test 1: Check if device exists and current status
echo "🔍 Step 1: Check device exists in UniFi"
DEVICES=$(curl -s "$API_URL/api/diagnostics" | jq '.dataAccess.clientCount')
echo "Total devices found: $DEVICES"
echo

# Test 2: Try blocking with verbose output
echo "🚫 Step 2: Attempt device block (detailed)"
BLOCK_RESULT=$(curl -s -w "HTTP_STATUS:%{http_code}\n" -X POST "$API_URL/api/parental/devices/9c:2f:9d:5a:61:03/block" \
  -H "Content-Type: application/json" \
  -d '{"reason":"debug_test"}')

echo "Block response: $BLOCK_RESULT"
echo

# Test 3: Check recent logs for exact error
echo "📋 Step 3: Recent error details"
curl -s "$API_URL/api/logs" | jq -r '.[] | select(.level == "error" and (.timestamp | fromdateiso8601) > (now - 300)) | .timestamp + " - " + .message' | head -5
echo

echo "💡 Analysis:"
echo "If we still get 403 with Super Admin, the issue could be:"
echo "• UniFi firmware 9.4.19 changed the blocking API"
echo "• Device MAC format issue (should be lowercase with colons)"
echo "• UniFi controller is in read-only/maintenance mode"
echo "• The /cmd/stamgr endpoint path changed in newer firmware"
echo "• Device is already blocked or in special state"

echo
echo "🔧 Next debugging steps:"
echo "1. Try blocking directly in UniFi web interface first"
echo "2. Check UniFi controller logs for API errors" 
echo "3. Test with a different device MAC"
echo "4. Verify the exact API endpoint in UniFi documentation"