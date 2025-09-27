# Use official Node.js runtime as base image
FROM node:18-alpine

# Install tools for debugging
RUN apk add --no-cache wget socat

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (including dev dependencies for UI build)
RUN npm ci

# Copy build script and UI source for building
COPY build-ui.js ./
COPY ui/ ./ui/

# Build UI during Docker build
RUN npm run build:ui

# Now copy the rest of the application source
COPY *.js ./
COPY src/ ./src/
COPY start.sh ./

# Remove dev dependencies after building to keep image small
RUN npm ci --omit=dev

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
