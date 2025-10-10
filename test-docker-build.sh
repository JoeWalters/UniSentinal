#!/bin/bash
# Test script for Docker build troubleshooting

echo "🔧 Testing Docker build locally..."

# Build just the first stage to isolate npm ci issues
echo "📦 Testing builder stage..."
docker build --target builder --platform linux/amd64 -t unisentinal:builder-test .

if [ $? -eq 0 ]; then
    echo "✅ Builder stage completed successfully for AMD64"
    
    # Test ARM64 builder stage
    echo "📦 Testing ARM64 builder stage..."
    docker build --target builder --platform linux/arm64 -t unisentinal:builder-arm64-test .
    
    if [ $? -eq 0 ]; then
        echo "✅ Builder stage completed successfully for ARM64"
        
        # Test full build
        echo "🏗️ Testing full multi-platform build..."
        docker buildx build --platform linux/amd64,linux/arm64 -t unisentinal:test .
        
        if [ $? -eq 0 ]; then
            echo "🎉 Multi-platform build completed successfully!"
        else
            echo "❌ Multi-platform build failed"
            exit 1
        fi
    else
        echo "❌ ARM64 builder stage failed"
        echo "💡 Try single-platform build instead"
        exit 1
    fi
else
    echo "❌ Builder stage failed for AMD64"
    echo "💡 Check dependencies and build tools"
    exit 1
fi

echo "✅ All tests passed!"