# Docker Build & Upload Template for New Repository

This template provides automatic Docker image building and uploading to Docker Hub with timestamped version numbers.

## 🎯 Quick Setup for New Repository

### Step 1: Copy Required Files

Create these files in your new repository:

#### `.github/workflows/docker-build.yml`
```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

env:
  REGISTRY: docker.io
  IMAGE_NAME: your-app-name  # ⬅️ CHANGE THIS

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Docker Hub
      if: github.event_name != 'pull_request'
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ secrets.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}

    - name: Generate version number
      id: version
      run: echo "VERSION=$(date +'%Y%m%d%H%M%S')" >> $GITHUB_OUTPUT

    - name: Update version in app (optional)
      run: |
        # Uncomment and modify for apps with version display
        # sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${{ steps.version.outputs.VERSION }}'/" src/main.js

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}
        tags: |
          type=raw,value=latest,enable={{is_default_branch}}
          type=raw,value=${{ steps.version.outputs.VERSION }},enable={{is_default_branch}}

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        platforms: linux/amd64,linux/arm64
        push: ${{ github.event_name != 'pull_request' }}
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Update README with new image info
      if: github.event_name != 'pull_request' && github.ref_name == 'main'
      run: |
        echo "🐳 Docker image built and pushed successfully!" >> $GITHUB_STEP_SUMMARY
        echo "📦 Images:" >> $GITHUB_STEP_SUMMARY
        echo "- \`${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:latest\`" >> $GITHUB_STEP_SUMMARY
        echo "- \`${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.VERSION }}\`" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "### Quick Start:" >> $GITHUB_STEP_SUMMARY
        echo "\`\`\`bash" >> $GITHUB_STEP_SUMMARY
        echo "docker run -p 8080:8080 ${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:latest" >> $GITHUB_STEP_SUMMARY
        echo "\`\`\`" >> $GITHUB_STEP_SUMMARY
```

#### `Dockerfile` (Basic Template)
```dockerfile
# Use appropriate base image for your app
FROM node:18-alpine
# or FROM python:3.11-alpine
# or FROM nginx:alpine

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Install dependencies (adjust for your language)
# RUN npm install
# or RUN pip install -r requirements.txt
# or just copy static files for nginx

# Expose port (change as needed)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start command (adjust for your app)
CMD ["npm", "start"]
# or CMD ["python", "app.py"]
# or CMD ["nginx", "-g", "daemon off;"]
```

#### `.dockerignore`
```
node_modules
.git
.gitignore
README.md
.env
.env.local
.env.*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
*.log
```

### Step 2: Configure Repository Secrets

In your GitHub repository settings:
1. Go to `Settings` → `Secrets and variables` → `Actions`
2. Add these repository secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Your Docker Hub access token

### Step 3: Customize for Your App

#### For Web Apps (like QuoteCanvas):
- Base image: `nginx:alpine`
- Port: Usually 80 or 8080
- Health check: `wget --quiet --tries=1 --spider http://localhost:8080/`

#### For Node.js Apps:
- Base image: `node:18-alpine`
- Port: Usually 3000 or 8080
- Add `RUN npm install` before CMD

#### For Python Apps:
- Base image: `python:3.11-alpine`
- Port: Usually 5000 or 8080
- Add `RUN pip install -r requirements.txt`

#### For Go Apps:
- Use multi-stage build with `golang:alpine` and `alpine:latest`
- Port: Usually 8080
- Compile to static binary

### Step 4: Update Your README.md

Add this section to your README:

```markdown
## 🐳 Docker

### Quick Start
```bash
docker run -p 8080:8080 joewalters/your-app-name:latest
```

### Available Tags
- `latest` - Most recent stable version
- `YYYYMMDDHHMISS` - Timestamped versions

### Docker Hub
Images are automatically built and published to Docker Hub: https://hub.docker.com/r/joewalters/your-app-name
```

## 🔄 What Happens Automatically

1. **On every push to main**:
   - Builds Docker image for AMD64 and ARM64
   - Tags with `latest` and timestamp (e.g., `20251008143022`)
   - Pushes to Docker Hub
   - Updates GitHub Actions summary

2. **Version Management**:
   - Timestamp format: `YYYYMMDDHHMISS`
   - Always know exactly when an image was built
   - Perfect for rollbacks and debugging

## 📝 Customization Checklist

- [ ] Change `IMAGE_NAME` in workflow file
- [ ] Update `Dockerfile` for your app type
- [ ] Adjust port numbers (default 8080)
- [ ] Modify health check command
- [ ] Update README with correct Docker Hub link
- [ ] Configure repository secrets
- [ ] Test build locally first

## 🎉 That's It!

Once set up, every commit to main will automatically build and push your Docker image to Docker Hub with timestamp versioning!