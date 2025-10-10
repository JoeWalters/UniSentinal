# Docker Troubleshooting for 403 Permission Errors

## Quick Docker Commands

### Check if container is running:
```bash
docker ps | grep unisentinal
```

### Check container logs:
```bash
docker logs <container_name> --tail 50
```

### Check environment variables:
```bash
docker inspect <container_name> | grep -A 10 "Env"
```

### Test API from host:
```bash
curl http://localhost:3000/api/permissions
```

### Test API from inside container:
```bash
docker exec <container_name> curl http://localhost:3000/api/permissions
```

## Common Docker Issues with UniFi

### 1. Network Connectivity
If running in Docker, ensure:
- Container can reach UniFi controller IP
- UniFi controller allows connections from container network
- No firewall blocking container traffic

**Test from container:**
```bash
docker exec <container_name> ping <UNIFI_HOST>
docker exec <container_name> curl -k https://<UNIFI_HOST>:443
```

### 2. Environment Variables
Verify your Docker environment has:
- `UNIFI_HOST=<your_unifi_ip>`
- `UNIFI_USERNAME=<admin_user>`
- `UNIFI_PASSWORD=<admin_pass>`
- `UNIFI_SITE=default` (or your site name)

### 3. Permission Diagnostics in Docker

Run the enhanced diagnostic from your host:
```bash
./test-permissions.sh
```

Or if on different host/port:
```bash
API_URL=http://192.168.1.100:3000 ./test-permissions.sh
```

### 4. Docker Compose Debugging

Add debugging to your docker-compose.yml:
```yaml
environment:
  - DEBUG=true
  - LOG_LEVEL=debug
```

### 5. Container Network Issues

If UniFi controller is also in Docker:
- Ensure both containers can communicate
- Use container names instead of localhost
- Check Docker network configuration

## Specific 403 Error Analysis

When you get 403 errors in Docker:

1. **Check container logs first:**
   ```bash
   docker logs <container_name> | grep -i "403\|permission\|error"
   ```

2. **Test permissions API:**
   ```bash
   curl http://localhost:3000/api/permissions | jq
   ```

3. **Test blocking capability:**
   ```bash
   curl http://localhost:3000/api/permissions/test-blocking | jq
   ```

4. **Verify UniFi accessibility from container:**
   ```bash
   docker exec <container_name> curl -k https://<UNIFI_HOST>:443/api/login
   ```

## Environment Variable Examples

### docker-compose.yml
```yaml
environment:
  - UNIFI_HOST=192.168.1.1
  - UNIFI_USERNAME=admin
  - UNIFI_PASSWORD=your_password
  - UNIFI_SITE=default
  - UNIFI_PORT=443
```

### Docker run command
```bash
docker run -d \
  -p 3000:3000 \
  -e UNIFI_HOST=192.168.1.1 \
  -e UNIFI_USERNAME=admin \
  -e UNIFI_PASSWORD=your_password \
  -v ./config:/config \
  unisentinal:latest
```

The enhanced permission system will help identify whether your 403 errors are:
- True permission issues
- Network connectivity problems  
- UniFi controller state issues
- API endpoint changes