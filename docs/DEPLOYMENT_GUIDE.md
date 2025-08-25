# 🚀 Full Sync System - Deployment Guide

## 🎯 Overview

This guide provides step-by-step instructions for deploying the Full Sync System to production environments, including Railway, AWS, Docker, and other platforms.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Railway Deployment](#railway-deployment)
- [Docker Deployment](#docker-deployment)
- [AWS Deployment](#aws-deployment)
- [Production Checklist](#production-checklist)
- [Monitoring Setup](#monitoring-setup)
- [Troubleshooting](#troubleshooting)

---

## ✅ Prerequisites

### System Requirements

**Minimum Requirements:**

- Node.js 18.x or higher
- PostgreSQL 14.x or higher
- 2 CPU cores
- 4GB RAM
- 20GB storage

**Recommended for Production:**

- Node.js 20.x LTS
- PostgreSQL 15.x
- 4+ CPU cores
- 8GB+ RAM
- 100GB+ SSD storage
- Load balancer for high availability

### Required Accounts & Services

- **Database**: PostgreSQL instance (NeonDB, AWS RDS, etc.)
- **APIs**: Smartlead and Lemlist API keys
- **Analytics**: Mixpanel project token (optional)
- **CRM**: Attio API key (optional)
- **Deployment**: Railway/AWS/Docker hosting

---

## 🔧 Environment Configuration

### 1. Environment Variables Setup

Copy the `.env.example` file and configure all required variables:

```bash
cp .env.example .env
```

### 2. Required Environment Variables

**Database Configuration:**

```bash
# Primary database connection (choose one)
DATABASE_URL="postgresql://user:password@host:5432/database"
POSTGRES_URL="postgresql://user:password@host:5432/database"

# Database connection pool settings
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=10000
DB_POOL_CONNECTION_TIMEOUT=5000
```

**API Keys:**

```bash
# Smartlead API
SMARTLEAD_API_KEY="your_smartlead_api_key"
SMARTLEAD_BASE_URL="https://server.smartlead.ai"

# Lemlist API
LEMLIST_API_KEY="your_lemlist_api_key"
LEMLIST_BASE_URL="https://api.lemlist.com"

# Attio CRM (optional)
ATTIO_API_KEY="your_attio_api_key"
ATTIO_BASE_URL="https://api.attio.com"

# Mixpanel Analytics (optional)
MIXPANEL_PROJECT_TOKEN="your_mixpanel_token"
```

**Application Configuration:**

```bash
# Server settings
PORT=3000
NODE_ENV=production

# Full Sync System
PERIODIC_SYNC_ENABLED=true
PERIODIC_SYNC_INTERVAL_MINUTES=60
PERIODIC_SYNC_LEMLIST_ENABLED=true
PERIODIC_SYNC_SMARTLEAD_ENABLED=true
PERIODIC_SYNC_MIXPANEL_ENABLED=true

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_BURST_SIZE=20
```

**Background Jobs:**

```bash
# Job queue configuration
JOB_QUEUE_REDIS_URL="redis://localhost:6379"
JOB_QUEUE_CONCURRENCY=5
JOB_QUEUE_MAX_ATTEMPTS=3
JOB_QUEUE_DELAY_MS=1000

# Cron jobs
CRON_SYNC_ENABLED=true
CRON_SYNC_SCHEDULE="0 */6 * * *"
CRON_CLEANUP_ENABLED=true
CRON_CLEANUP_SCHEDULE="0 2 * * *"
```

### 3. Environment-Specific Configurations

**Development (.env.development):**

```bash
NODE_ENV=development
LOG_LEVEL=debug
DB_POOL_MAX=10
PERIODIC_SYNC_INTERVAL_MINUTES=30
```

**Staging (.env.staging):**

```bash
NODE_ENV=staging
LOG_LEVEL=info
DB_POOL_MAX=15
PERIODIC_SYNC_INTERVAL_MINUTES=15
```

**Production (.env.production):**

```bash
NODE_ENV=production
LOG_LEVEL=warn
DB_POOL_MAX=20
PERIODIC_SYNC_INTERVAL_MINUTES=60
```

---

## 🗄️ Database Setup

### 1. Database Creation

**NeonDB (Recommended):**

```sql
-- Create database
CREATE DATABASE cairo_production;

-- Create user with appropriate permissions
CREATE USER cairo_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cairo_production TO cairo_user;
```

**AWS RDS:**

```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier cairo-production \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 15.4 \
  --master-username cairo_user \
  --master-user-password secure_password \
  --allocated-storage 100 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-xxxxxxxxx
```

### 2. Database Initialization

**Run Initial Migrations:**

```bash
# Apply all database migrations
npm run migrate:up

# Or using the API
curl -X POST https://your-app.com/api/migrations/run \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"migrations": ["all"]}'
```

### 3. Database Optimizations

**Apply Performance Optimizations:**

```bash
# Via API
curl -X POST https://your-app.com/api/database/optimize \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "optimizations": [
      "sync_indexes",
      "bulk_operations",
      "connection_pool",
      "query_optimization"
    ]
  }'
```

**Manual Index Creation (if needed):**

```sql
-- Sync performance indexes
CREATE INDEX CONCURRENTLY idx_event_source_platform_created_at
ON event_source (platform, created_at);

CREATE INDEX CONCURRENTLY idx_event_source_event_key_hash
ON event_source USING hash (event_key);

CREATE INDEX CONCURRENTLY idx_user_source_email_platform
ON user_source (email, platform);
```

---

## 🚄 Railway Deployment

### 1. Railway Setup

**Install Railway CLI:**

```bash
npm install -g @railway/cli
railway login
```

**Create New Project:**

```bash
railway init cairo-sync-system
cd cairo-sync-system
```

### 2. Database Configuration

**Add NeonDB Database:**

```bash
# Link NeonDB database
railway add --database postgresql
# Or use external NeonDB
railway variables set DATABASE_URL="postgresql://user:pass@host:5432/db"
```

### 3. Environment Variables

**Set Production Variables:**

```bash
# Core configuration
railway variables set NODE_ENV=production
railway variables set PORT=3000

# API keys
railway variables set SMARTLEAD_API_KEY="your_key"
railway variables set LEMLIST_API_KEY="your_key"
railway variables set MIXPANEL_PROJECT_TOKEN="your_token"

# Sync configuration
railway variables set PERIODIC_SYNC_ENABLED=true
railway variables set PERIODIC_SYNC_INTERVAL_MINUTES=60

# Background jobs
railway variables set CRON_SYNC_ENABLED=true
railway variables set CRON_SYNC_SCHEDULE="0 */6 * * *"
```

### 4. Deployment Configuration

**railway.json:**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  },
  "environments": {
    "production": {
      "variables": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 5. Deploy to Railway

```bash
# Deploy application
railway up

# Check deployment status
railway status

# View logs
railway logs
```

### 6. Post-Deployment Setup

**Initialize Database:**

```bash
# Run migrations via deployed app
curl -X POST https://your-railway-app.railway.app/api/migrations/run \
  -H "Authorization: Bearer YOUR_API_KEY"

# Apply database optimizations
curl -X POST https://your-railway-app.railway.app/api/database/optimize \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 🐳 Docker Deployment

### 1. Dockerfile

**Create Dockerfile:**

```dockerfile
# Use official Node.js runtime
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["npm", "start"]
```

### 2. Docker Compose

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  cairo-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SMARTLEAD_API_KEY=${SMARTLEAD_API_KEY}
      - LEMLIST_API_KEY=${LEMLIST_API_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=cairo
      - POSTGRES_USER=cairo_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 3. Docker Deployment Commands

```bash
# Build and start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f cairo-app

# Scale application
docker-compose up --scale cairo-app=3

# Update deployment
docker-compose pull
docker-compose up -d
```

---

## ☁️ AWS Deployment

### 1. ECS Deployment

**Task Definition (task-definition.json):**

```json
{
  "family": "cairo-sync-system",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "cairo-app",
      "image": "your-account.dkr.ecr.region.amazonaws.com/cairo:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:ssm:region:account:parameter/cairo/database-url"
        },
        {
          "name": "SMARTLEAD_API_KEY",
          "valueFrom": "arn:aws:ssm:region:account:parameter/cairo/smartlead-key"
        }
      ],
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cairo-sync-system",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**ECS Service Creation:**

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name cairo-production

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Create service
aws ecs create-service \
  --cluster cairo-production \
  --service-name cairo-sync-service \
  --task-definition cairo-sync-system:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

### 2. Lambda Deployment (for background jobs)

**serverless.yml:**

```yaml
service: cairo-sync-jobs

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    DATABASE_URL: ${ssm:/cairo/database-url}
    SMARTLEAD_API_KEY: ${ssm:/cairo/smartlead-key}
    LEMLIST_API_KEY: ${ssm:/cairo/lemlist-key}

functions:
  periodicSync:
    handler: src/lambda/periodicSync.handler
    timeout: 900
    memorySize: 1024
    events:
      - schedule: rate(60 minutes)

  cleanupJob:
    handler: src/lambda/cleanup.handler
    timeout: 300
    events:
      - schedule: cron(0 2 * * ? *)

plugins:
  - serverless-offline
```

---

## ✅ Production Checklist

### Pre-Deployment Checklist

- [ ] **Environment Variables**: All required variables configured
- [ ] **Database**: Production database set up with proper credentials
- [ ] **API Keys**: Valid API keys for all services
- [ ] **SSL Certificates**: HTTPS certificates configured
- [ ] **DNS Setup**: Domain pointing to deployment
- [ ] **Backup Strategy**: Database backup procedures in place
- [ ] **Monitoring**: Application and infrastructure monitoring configured

### Post-Deployment Checklist

- [ ] **Health Checks**: Application health endpoint responding
- [ ] **Database Migrations**: All migrations applied successfully
- [ ] **Database Optimizations**: Performance optimizations applied
- [ ] **Background Jobs**: Cron jobs and periodic sync running
- [ ] **API Endpoints**: All endpoints accessible and functional
- [ ] **Rate Limiting**: Rate limits configured and working
- [ ] **Error Handling**: Error monitoring and alerting active
- [ ] **Performance**: Response times within acceptable limits
- [ ] **Security**: Security headers and protections in place
- [ ] **Documentation**: Deployment documentation updated

### Security Checklist

- [ ] **API Keys**: Stored securely in environment variables
- [ ] **Database**: Connection encrypted, credentials secured
- [ ] **HTTPS**: SSL/TLS enabled for all communications
- [ ] **CORS**: Cross-origin requests properly configured
- [ ] **Rate Limiting**: Protection against abuse enabled
- [ ] **Input Validation**: All inputs properly validated
- [ ] **Error Handling**: No sensitive data in error responses
- [ ] **Logging**: Audit logs enabled, no sensitive data logged
- [ ] **Updates**: Dependencies updated, security patches applied

---

## 📊 Monitoring Setup

### 1. Application Monitoring

**Health Check Endpoint:**

```javascript
// Add to your Express app
app.get("/health", async (req, res) => {
  try {
    // Check database connection
    await query("SELECT 1");

    // Check external APIs
    const checks = await Promise.allSettled([
      checkSmartleadAPI(),
      checkLemlistAPI(),
      checkDatabasePerformance(),
    ]);

    const healthy = checks.every((check) => check.status === "fulfilled");

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks: checks.map((check) => ({
        status: check.status,
        value: check.value || check.reason?.message,
      })),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
```

### 2. Performance Monitoring

**Custom Metrics Collection:**

```javascript
// Add to your application
const metrics = {
  syncOperations: 0,
  eventKeysGenerated: 0,
  databaseQueries: 0,
  apiCalls: 0,
  errors: 0,
};

// Expose metrics endpoint
app.get("/metrics", (req, res) => {
  res.json({
    ...metrics,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
```

### 3. Database Monitoring

**Performance Query:**

```sql
-- Create monitoring view
CREATE VIEW sync_performance AS
SELECT
  platform,
  COUNT(*) as total_events,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_sync,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_process_time
FROM event_source
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform;
```

### 4. Alert Configuration

**CloudWatch Alarms (AWS):**

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name cairo-high-error-rate \
  --alarm-description "High error rate detected" \
  --metric-name ErrorRate \
  --namespace Cairo/Application \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Database connection alarm
aws cloudwatch put-metric-alarm \
  --alarm-name cairo-db-connections \
  --alarm-description "High database connections" \
  --metric-name DatabaseConnections \
  --namespace Cairo/Database \
  --statistic Average \
  --period 300 \
  --threshold 18 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3
```

---

## 🔧 Troubleshooting

### Common Deployment Issues

**1. Database Connection Issues**

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check connection pool
curl https://your-app.com/api/database/performance
```

**2. API Key Issues**

```bash
# Test API connectivity
curl -H "Authorization: Bearer $SMARTLEAD_API_KEY" \
  https://server.smartlead.ai/api/v1/campaigns
```

**3. Memory Issues**

```bash
# Check memory usage
curl https://your-app.com/metrics

# Increase memory limits in Docker
docker run -m 4g your-app
```

### Performance Issues

**1. Slow Database Queries**

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**2. High Memory Usage**

```bash
# Clear event key cache
curl -X POST https://your-app.com/api/event-keys/clear-cache

# Monitor memory patterns
curl https://your-app.com/metrics | grep memory
```

### Debugging Tools

**1. Enable Debug Logging**

```bash
# Temporarily enable debug logging
export LOG_LEVEL=debug
npm start
```

**2. Database Query Logging**

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
```

---

## 📈 Scaling Considerations

### Horizontal Scaling

**Load Balancer Configuration:**

```nginx
upstream cairo_backend {
    server app1:3000;
    server app2:3000;
    server app3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://cairo_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Database Scaling

**Read Replicas:**

```bash
# Configure read replica connection
export DATABASE_READ_URL="postgresql://readonly_user:pass@read-replica:5432/db"
```

**Connection Pooling:**

```javascript
// Increase pool size for high load
const poolConfig = {
  min: 5,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};
```

---

## 🎯 Production Best Practices

### 1. Security

- Use environment variables for all secrets
- Enable HTTPS/TLS for all communications
- Implement proper CORS policies
- Regular security audits and updates

### 2. Performance

- Enable compression for API responses
- Implement caching strategies
- Monitor and optimize database queries
- Use CDN for static assets

### 3. Reliability

- Implement circuit breakers for external APIs
- Set up proper error handling and retries
- Configure health checks and monitoring
- Maintain comprehensive logs

### 4. Maintenance

- Automate deployments with CI/CD
- Regular backup and recovery testing
- Keep dependencies updated
- Monitor performance metrics continuously

---

**Last Updated**: January 2024  
**Guide Version**: 1.0.0
