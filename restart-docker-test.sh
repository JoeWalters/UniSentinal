#!/bin/bash

echo "🔄 Docker Container Restart Instructions"
echo "======================================="
echo
echo "The UniSentinal code has been updated with multiple API endpoint fallbacks"
echo "for UniFi 9.4.19 compatibility. To test the fix:"
echo
echo "1️⃣ Restart your Docker container:"
echo "   docker restart <container_name>"
echo "   # OR"
echo "   docker-compose down && docker-compose up -d"
echo
echo "2️⃣ Wait for container to start (30 seconds)"
echo
echo "3️⃣ Test the enhanced blocking:"
echo "   curl -s -X POST 'http://192.168.0.74:8003/api/parental/devices/b8:31:b5:1d:8d:e2/block' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"reason\":\"api_test\"}'"
echo
echo "4️⃣ Check the detailed logs:"
echo "   curl -s 'http://192.168.0.74:8003/api/logs' | tail -10"
echo
echo "📋 What the updated code does:"
echo "• Tries 5 different API endpoints in sequence"
echo "• Tests various command formats (block-sta, block_sta)"
echo "• Includes Dream Machine specific endpoints"
echo "• Logs which endpoint works (if any)"
echo
echo "🎯 Expected outcome:"
echo "• If ANY endpoint works, blocking will succeed"
echo "• Logs will show which endpoint was successful"
echo "• If all fail, we'll know the API is completely restricted"

echo
echo "💡 Note: You confirmed manual blocking works, so there MUST be a working API"
echo "The updated code should find it!"