# Use official Node.js runtime as base image
FROM node:18-alpine

# Install tools for debugging
RUN apk add --no-cache wget socat

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy application source code
COPY *.js ./
COPY src/ ./src/
COPY start.sh ./

# Make start script executable
RUN chmod +x ./start.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001
USER nodeuser

# Expose port (Railway will override this with PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health/simple || exit 1

# Start the application using the pre-flight check script
CMD ["./start.sh"]
