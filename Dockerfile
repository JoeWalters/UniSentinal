# Use the official Node.js 18 runtime as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory to the nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Add build arguments for version information
ARG BUILD_DATE
ARG VERSION
ARG VCS_REF

# Add labels for metadata
LABEL org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source="https://github.com/JoeWalters/UniSentinal" \
      org.opencontainers.image.title="UniSentinal" \
      org.opencontainers.image.description="UniFi Dream Machine device monitoring web app"

# Set environment variables for version info
ENV BUILD_DATE=$BUILD_DATE
ENV VERSION=$VERSION
ENV VCS_REF=$VCS_REF

# Command to run the application
CMD ["npm", "start"]