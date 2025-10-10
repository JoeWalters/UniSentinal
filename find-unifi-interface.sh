#!/bin/bash

echo "🔍 Finding UniFi Dream Machine Web Interface"
echo "==========================================="

echo "Your Dream Machine has multiple IP addresses:"
echo "• 192.168.0.1 (primary)"
echo "• 192.168.2.1"
echo "• 192.168.4.1"
echo "• 192.168.5.1"
echo "• 192.168.6.1" 
echo "• 192.168.7.1"
echo

echo "🌐 Try these UniFi web interface URLs:"
echo

echo "1️⃣ Standard UniFi Network (most likely):"
echo "   https://192.168.0.1/"
echo "   https://192.168.0.1:443/"
echo

echo "2️⃣ Legacy controller port:"
echo "   https://192.168.0.1:8443/"
echo

echo "3️⃣ Other network interfaces:"
echo "   https://192.168.2.1/"
echo "   https://192.168.4.1/"
echo

echo "4️⃣ Dream Machine direct access:"
echo "   https://192.168.0.1:8443/network/default/settings/admins"
echo

echo "💡 Notes:"
echo "• Dream Machine SE typically uses port 443 (not 8443)"
echo "• The web interface is usually just https://[ip]/ without port"
echo "• You may get SSL certificate warnings - click 'Advanced' → 'Proceed'"
echo

echo "🔧 Testing connectivity to each interface:"
for ip in "192.168.0.1" "192.168.2.1" "192.168.4.1"; do
    echo -n "Testing $ip:443... "
    timeout 3 bash -c "</dev/tcp/$ip/443" 2>/dev/null && echo "✅ Open" || echo "❌ Closed"
    
    echo -n "Testing $ip:8443... "
    timeout 3 bash -c "</dev/tcp/$ip/8443" 2>/dev/null && echo "✅ Open" || echo "❌ Closed"
done

echo
echo "🎯 Most likely working URL: https://192.168.0.1/"