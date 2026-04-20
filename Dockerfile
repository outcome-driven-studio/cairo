FROM node:18-alpine

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

# No HEALTHCHECK: Cloud Run uses its own TCP startup probe (240s timeout),
# which gives us time to run migrations before binding port 8080.

CMD ["./start.sh"]
