FROM node:18-alpine

RUN apk add --no-cache wget

WORKDIR /app

# Copy package files for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY *.js ./
COPY bin/ ./bin/
COPY src/ ./src/
COPY llms.txt ./
COPY start.sh ./

RUN chmod +x ./start.sh

# Verify migrations directory exists
RUN ls -la ./src/migrations/ && echo "Migrations directory confirmed"

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001
USER nodeuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health/simple || exit 1

CMD ["./start.sh"]
