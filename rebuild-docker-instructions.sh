#!/bin/bash

echo "🔄 Rebuild Docker Container with Enhanced API Support"
echo "=================================================="
echo
echo "Your current container was built at 05:51:16Z but the enhanced API code"
echo "was added after that. You need to rebuild with the latest code:"
echo
echo "1️⃣ Stop current container:"
echo "   docker-compose down"
echo
echo "2️⃣ Rebuild with latest code:"
echo "   docker-compose build --no-cache"
echo
echo "3️⃣ Start with new image:"
echo "   docker-compose up -d"
echo
echo "4️⃣ Wait for startup (30 seconds), then test:"
echo "   sleep 30"
echo "   curl -s -X POST 'http://192.168.0.74:8003/api/parental/devices/b8:31:b5:1d:8d:e2/block' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"reason\":\"rebuilt_container_test\"}'"
echo
echo "5️⃣ Check for enhanced logging:"
echo "   curl -s 'http://192.168.0.74:8003/api/logs' | grep -i 'trying endpoint'"
echo
echo "💡 What to expect with the new code:"
echo "• Multiple 'Trying endpoint:' log messages"
echo "• Detailed attempts at different API paths"
echo "• Either success with working endpoint OR"
echo "• Clear confirmation that all endpoints fail"
echo
echo "🎯 The enhanced code will systematically test:"
echo "• /api/s/default/cmd/stamgr (original)"
echo "• /api/s/default/cmd/sta-mgr (alternative)"  
echo "• /api/s/default/rest/user (modern)"
echo "• /proxy/network/api/s/default/cmd/stamgr (proxy)"
echo "• Various command formats (block-sta vs block_sta)"
echo
echo "Since manual blocking works, one of these SHOULD succeed!"