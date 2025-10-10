#!/bin/bash

# Test specific UniFi permissions for device management
API_URL="http://192.168.0.74:8003"

echo "🔍 Testing UniFi 'Network Only' Role Permissions"
echo "=============================================="

echo "📋 Current user info:"
curl -s "$API_URL/api/diagnostics" | jq '.authentication'
echo

echo "🚫 Testing device blocking capability:"
echo "Attempting to block test device..."
BLOCK_RESULT=$(curl -s -X POST "$API_URL/api/parental/devices/9c:2f:9d:5a:61:03/block" \
  -H "Content-Type: application/json" \
  -d '{"reason":"permission_test"}')

echo "Block result: $BLOCK_RESULT"
echo

if echo "$BLOCK_RESULT" | grep -q "403\|Access denied\|Failed to block"; then
    echo "❌ CONFIRMED: Network Only role cannot block devices"
    echo
    echo "🔧 SOLUTION: Update svcunisentinal user role:"
    echo "   1. Login to UniFi controller web interface"
    echo "   2. Go to Settings → Admins" 
    echo "   3. Find 'svcunisentinal' user"
    echo "   4. Change Role from 'Network Only' to 'Full Management'"
    echo "   5. Save changes"
    echo
    echo "💡 Alternative: Create new admin user with Full Management"
else
    echo "✅ Blocking worked - permissions are sufficient"
fi

echo
echo "📊 Permission Analysis:"
echo "• Network Only = Can view/configure network infrastructure"
echo "• Full Management = Network Only + Client/Device management"
echo "• Device blocking requires CLIENT management permissions"
echo "• Your 403 errors confirm: Network Only ≠ Device Management"