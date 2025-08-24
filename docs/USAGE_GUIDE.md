# 📖 Full Sync System - Usage Guide

## 🎯 Overview

This guide provides practical examples and best practices for using the Full Sync System effectively. Learn how to perform different types of synchronization, optimize performance, and troubleshoot common scenarios.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Sync Modes Explained](#sync-modes-explained)
- [Common Use Cases](#common-use-cases)
- [Advanced Configurations](#advanced-configurations)
- [Performance Optimization](#performance-optimization)
- [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)
- [Best Practices](#best-practices)

---

## 🚀 Quick Start

### 1. Basic Full Sync

The simplest way to sync all historical data from both platforms:

```bash
curl -X POST https://your-app.com/api/full-sync/execute \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": "smartlead,lemlist",
    "syncMode": "full_historical",
    "enableProgressTracking": true
  }'
```

**Response:**

```json
{
  "success": true,
  "jobId": "job_1234567890",
  "estimatedDuration": "45 minutes",
  "progressUrl": "/api/full-sync/status/job_1234567890"
}
```

### 2. Monitor Progress

```bash
# Check sync progress
curl https://your-app.com/api/full-sync/status/job_1234567890

# Response shows real-time progress
{
  "status": "in_progress",
  "progress": {
    "percentage": 65,
    "current_stage": "processing_lemlist_activities",
    "eta_minutes": 15
  }
}
```

### 3. Verify Results

```bash
# Check event key statistics
curl https://your-app.com/api/event-keys/stats

# Check database performance
curl https://your-app.com/api/database/performance
```

---

## 🔄 Sync Modes Explained

### 1. Full Historical Sync

**When to use:** First-time setup, data recovery, complete refresh

```javascript
const fullHistoricalSync = {
  platforms: ["smartlead", "lemlist"],
  syncMode: "full_historical",
  namespaces: ["production"],
  batchSize: 100,
  enableProgressTracking: true,
};

// This mode:
// - Ignores last_sync_time
// - Processes ALL historical data
// - Takes longest but most comprehensive
// - Recommended for initial setup
```

**Example scenario:** Setting up the system for the first time

```bash
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "full_historical",
  "namespaces": "production",
  "webhookUrl": "https://your-app.com/webhook/sync-complete"
}'
```

### 2. Delta Since Last Sync

**When to use:** Regular maintenance, catching up missed data

```javascript
const deltaSync = {
  platforms: ["smartlead"],
  syncMode: "delta_since_last",
  namespaces: ["production"],
  batchSize: 50,
};

// This mode:
// - Uses stored last_sync_time
// - Only processes new data
// - Fastest for regular updates
// - Maintains incremental sync state
```

**Example scenario:** Daily automatic sync

```bash
# This will automatically use the last sync timestamp
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead",
  "syncMode": "delta_since_last",
  "namespaces": "production"
}'
```

### 3. Date Range Sync

**When to use:** Syncing specific time periods, historical analysis

```javascript
const dateRangeSync = {
  platforms: ["lemlist"],
  syncMode: "date_range",
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  namespaces: ["production"],
  batchSize: 75,
};

// This mode:
// - Syncs only specified date range
// - Useful for backfilling gaps
// - Precise control over time period
// - Good for historical analysis
```

**Example scenario:** Backfill missing December data

```bash
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "date_range",
  "startDate": "2023-12-01",
  "endDate": "2023-12-31",
  "namespaces": "production"
}'
```

### 4. Namespace Reset

**When to use:** Clean slate for specific namespace, testing

```javascript
const namespaceReset = {
  platforms: ["smartlead", "lemlist"],
  syncMode: "namespace_reset",
  namespaces: ["staging"],
  batchSize: 100,
};

// This mode:
// - Clears existing namespace data
// - Rebuilds from scratch
// - Useful for testing environments
// - Ensures clean data state
```

**Example scenario:** Reset staging environment

```bash
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "namespace_reset",
  "namespaces": "staging"
}'
```

---

## 💼 Common Use Cases

### Use Case 1: Initial System Setup

**Scenario:** You're setting up the Full Sync System for the first time.

**Steps:**

1. **Apply database optimizations**
2. **Run full historical sync**
3. **Verify data integrity**
4. **Set up monitoring**

```bash
# Step 1: Optimize database
curl -X POST /api/database/optimize -d '{
  "optimizations": ["sync_indexes", "bulk_operations"]
}'

# Step 2: Initial full sync
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "full_historical",
  "namespaces": "production",
  "batchSize": 100,
  "enableProgressTracking": true,
  "enableMixpanelTracking": true,
  "webhookUrl": "https://your-app.com/webhooks/setup-complete"
}'

# Step 3: Monitor progress
watch -n 30 "curl -s /api/full-sync/status/JOB_ID | jq '.progress'"

# Step 4: Verify results
curl /api/event-keys/stats
```

### Use Case 2: Daily Automated Sync

**Scenario:** You want to sync new data every day automatically.

**Setup with cron job:**

```bash
# Add to crontab (runs every day at 2 AM)
0 2 * * * curl -X POST https://your-app.com/api/full-sync/execute \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"platforms":"smartlead,lemlist","syncMode":"delta_since_last"}'
```

**Setup with background job service:**

```javascript
// In your application
const dailySync = async () => {
  try {
    const response = await fetch("/api/full-sync/execute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platforms: "smartlead,lemlist",
        syncMode: "delta_since_last",
        namespaces: "production",
        enableMixpanelTracking: true,
      }),
    });

    const result = await response.json();
    console.log("Daily sync initiated:", result.jobId);

    // Optional: Wait for completion
    await waitForCompletion(result.jobId);
  } catch (error) {
    console.error("Daily sync failed:", error);
    // Send alert to monitoring system
    await sendAlert("Daily sync failed", error);
  }
};

// Schedule daily sync
setInterval(dailySync, 24 * 60 * 60 * 1000); // Every 24 hours
```

### Use Case 3: Platform-Specific Sync

**Scenario:** You want to sync only Smartlead data due to API rate limits.

```bash
# Smartlead only with smaller batch size
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead",
  "syncMode": "delta_since_last",
  "namespaces": "production",
  "batchSize": 25,
  "enableProgressTracking": true
}'

# Later, sync Lemlist separately
curl -X POST /api/full-sync/execute -d '{
  "platforms": "lemlist",
  "syncMode": "delta_since_last",
  "namespaces": "production",
  "batchSize": 50
}'
```

### Use Case 4: Environment-Specific Syncs

**Scenario:** Different sync strategies for staging vs production.

**Production (conservative, thorough):**

```bash
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "delta_since_last",
  "namespaces": "production",
  "batchSize": 50,
  "enableProgressTracking": true,
  "enableMixpanelTracking": true,
  "enableAttioSync": true,
  "webhookUrl": "https://your-app.com/webhooks/prod-sync"
}'
```

**Staging (aggressive, for testing):**

```bash
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "full_historical",
  "namespaces": "staging",
  "batchSize": 200,
  "enableProgressTracking": true
}'
```

### Use Case 5: Data Recovery

**Scenario:** You need to recover missing data from a specific time period.

```bash
# Identify the gap
START_DATE="2024-01-15"
END_DATE="2024-01-20"

# Sync the missing period
curl -X POST /api/full-sync/execute -d '{
  "platforms": "smartlead,lemlist",
  "syncMode": "date_range",
  "startDate": "'$START_DATE'",
  "endDate": "'$END_DATE'",
  "namespaces": "production",
  "batchSize": 100,
  "enableProgressTracking": true
}'
```

---

## ⚙️ Advanced Configurations

### 1. High-Volume Sync Optimization

**For large datasets (100k+ records):**

```javascript
const highVolumeConfig = {
  platforms: ["smartlead", "lemlist"],
  syncMode: "full_historical",
  namespaces: ["production"],
  batchSize: 200, // Larger batches
  enableProgressTracking: true,
  enableMixpanelTracking: false, // Disable to reduce overhead
  enableAttioSync: false, // Disable to focus on core sync

  // Advanced options (if available)
  parallelWorkers: 3,
  rateLimitOverride: {
    requestsPerSecond: 50,
    burstSize: 100,
  },
};
```

### 2. Memory-Optimized Configuration

**For systems with limited memory:**

```javascript
const memoryOptimizedConfig = {
  platforms: ["smartlead"], // One platform at a time
  syncMode: "delta_since_last",
  namespaces: ["production"],
  batchSize: 25, // Smaller batches
  enableProgressTracking: false, // Reduce memory usage

  // Process in smaller chunks
  dateRange: {
    chunkSize: 7, // Process 7 days at a time
    delay: 1000, // 1 second delay between chunks
  },
};
```

### 3. Development Environment Setup

**For fast development cycles:**

```bash
# Quick development sync
curl -X POST /api/full-sync/execute -d '{
  "platforms": "lemlist",
  "syncMode": "date_range",
  "startDate": "2024-01-01",
  "endDate": "2024-01-07",
  "namespaces": "development",
  "batchSize": 10,
  "enableProgressTracking": true
}'
```

### 4. Custom Event Key Generation

**For special scenarios requiring custom event keys:**

```bash
# Generate custom event key
curl -X POST /api/event-keys/generate -d '{
  "platform": "lemlist",
  "campaignId": "custom_campaign_001",
  "eventType": "custom_event",
  "email": "test@example.com",
  "activityId": "custom_activity_123",
  "namespace": "custom_namespace",
  "timestamp": "2024-01-15T10:30:00Z"
}'
```

---

## 🚀 Performance Optimization

### 1. Batch Size Optimization

**Find optimal batch size for your environment:**

```bash
# Test different batch sizes
for batch_size in 25 50 100 200; do
  echo "Testing batch size: $batch_size"
  time curl -X POST /api/full-sync/execute -d "{
    \"platforms\": \"smartlead\",
    \"syncMode\": \"date_range\",
    \"startDate\": \"2024-01-01\",
    \"endDate\": \"2024-01-02\",
    \"batchSize\": $batch_size
  }"
  sleep 60
done
```

**Batch size recommendations:**

- **Small datasets (<1k records)**: 25-50
- **Medium datasets (1k-10k records)**: 50-100
- **Large datasets (10k+ records)**: 100-200
- **High-performance systems**: 200-500

### 2. Database Optimization

**Pre-sync optimization:**

```bash
# Apply all optimizations before large sync
curl -X POST /api/database/optimize -d '{
  "optimizations": [
    "sync_indexes",
    "bulk_operations",
    "connection_pool",
    "query_optimization"
  ]
}'
```

**Monitor during sync:**

```bash
# Monitor database performance
watch -n 30 "curl -s /api/database/performance | jq '.performance'"
```

### 3. Memory Management

**Monitor memory usage:**

```bash
# Check application metrics
curl /api/metrics | jq '.memory'

# Clear event key cache if needed
curl -X POST /api/event-keys/clear-cache
```

### 4. Rate Limit Optimization

**Adjust rate limits based on API quotas:**

```javascript
// Example: Smartlead has higher limits than Lemlist
const rateLimitConfig = {
  smartlead: {
    requestsPerSecond: 100,
    burstSize: 200,
    retryAttempts: 3,
  },
  lemlist: {
    requestsPerSecond: 50,
    burstSize: 100,
    retryAttempts: 5,
  },
};
```

---

## 📊 Monitoring and Troubleshooting

### 1. Real-Time Monitoring

**Monitor active sync operations:**

```bash
#!/bin/bash
# monitor-sync.sh - Monitor ongoing sync operations

JOB_ID=$1
if [ -z "$JOB_ID" ]; then
  echo "Usage: ./monitor-sync.sh JOB_ID"
  exit 1
fi

echo "Monitoring sync job: $JOB_ID"
echo "================================"

while true; do
  status=$(curl -s /api/full-sync/status/$JOB_ID)

  if echo "$status" | jq -e '.status == "completed"' > /dev/null; then
    echo "✅ Sync completed successfully!"
    echo "$status" | jq '.summary'
    break
  elif echo "$status" | jq -e '.status == "failed"' > /dev/null; then
    echo "❌ Sync failed!"
    echo "$status" | jq '.error'
    break
  else
    progress=$(echo "$status" | jq -r '.progress.percentage')
    stage=$(echo "$status" | jq -r '.progress.current_stage')
    eta=$(echo "$status" | jq -r '.progress.eta_minutes')

    echo "$(date): $progress% - $stage (ETA: ${eta}min)"
  fi

  sleep 30
done
```

### 2. Performance Analysis

**Analyze sync performance:**

```bash
# Get detailed performance metrics
curl /api/database/performance | jq '{
  connection_pool: .performance.connection_pool,
  query_times: .performance.query_performance,
  bulk_operations: .performance.bulk_operations
}'

# Event key generation stats
curl /api/event-keys/stats | jq '{
  generation_rate: .stats.generation_rate,
  collision_rate: .stats.collision_rate,
  cache_efficiency: .stats.cache_size
}'
```

### 3. Error Diagnosis

**Common error patterns and solutions:**

**Database Connection Errors:**

```bash
# Check database connectivity
curl /api/database/performance

# If connection issues:
# 1. Verify DATABASE_URL
# 2. Check connection pool settings
# 3. Ensure database is accessible
```

**API Rate Limit Errors:**

```bash
# Check current rate limits
curl /api/metrics | jq '.rate_limits'

# Solutions:
# 1. Reduce batch size
# 2. Increase delays between requests
# 3. Implement exponential backoff
```

**Memory Issues:**

```bash
# Check memory usage
curl /api/metrics | jq '.memory'

# If high memory usage:
curl -X POST /api/event-keys/clear-cache
# Reduce batch sizes
# Enable memory monitoring
```

### 4. Debugging Specific Issues

**Collision Detection Issues:**

```bash
# Check collision statistics
curl /api/event-keys/stats

# High collision rate (>5%) may indicate:
# 1. Duplicate data in source systems
# 2. Insufficient unique identifiers
# 3. System clock issues
```

**Sync Performance Issues:**

```bash
# Monitor sync duration trends
curl /api/full-sync/history | jq '.jobs[] | {
  duration: .duration_ms,
  records: .summary.total_processed,
  rate: (.summary.total_processed / (.duration_ms / 1000))
}'
```

---

## 🎯 Best Practices

### 1. Sync Scheduling

**Recommended schedule patterns:**

```bash
# Production: Conservative, thorough
0 2 * * * /path/to/daily-sync.sh production delta_since_last

# Staging: More frequent, for testing
0 */6 * * * /path/to/sync.sh staging delta_since_last

# Development: On-demand only
# No automated sync, manual triggers
```

### 2. Error Handling

**Implement robust error handling:**

```javascript
const syncWithRetry = async (config, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("/api/full-sync/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const result = await response.json();
        return result;
      }

      // Handle specific error codes
      if (response.status === 429) {
        // Rate limited - wait longer
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      console.error(`Sync attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};
```

### 3. Data Validation

**Validate sync results:**

```bash
#!/bin/bash
# validate-sync.sh - Validate sync operation results

JOB_ID=$1
EXPECTED_MIN_RECORDS=${2:-100}

# Get sync results
RESULT=$(curl -s /api/full-sync/status/$JOB_ID)
STATUS=$(echo "$RESULT" | jq -r '.status')
PROCESSED=$(echo "$RESULT" | jq -r '.summary.total_processed')

if [ "$STATUS" != "completed" ]; then
  echo "❌ Sync not completed. Status: $STATUS"
  exit 1
fi

if [ "$PROCESSED" -lt "$EXPECTED_MIN_RECORDS" ]; then
  echo "⚠️  Warning: Only $PROCESSED records processed (expected >$EXPECTED_MIN_RECORDS)"
  exit 1
fi

echo "✅ Sync validation passed: $PROCESSED records processed"
```

### 4. Resource Management

**Monitor and manage resources:**

```bash
# Pre-sync resource check
check_resources() {
  local memory_usage=$(curl -s /api/metrics | jq -r '.memory.heapUsed')
  local db_connections=$(curl -s /api/database/performance | jq -r '.performance.connection_pool.active')

  if [ "$memory_usage" -gt 1000000000 ]; then  # 1GB
    echo "High memory usage detected: $(($memory_usage / 1000000))MB"
    return 1
  fi

  if [ "$db_connections" -gt 15 ]; then
    echo "High database connection usage: $db_connections"
    return 1
  fi

  return 0
}

# Run sync only if resources are available
if check_resources; then
  curl -X POST /api/full-sync/execute -d "$SYNC_CONFIG"
else
  echo "Skipping sync due to resource constraints"
fi
```

### 5. Maintenance Tasks

**Regular maintenance schedule:**

```bash
# Weekly maintenance script
#!/bin/bash
# weekly-maintenance.sh

echo "Starting weekly maintenance..."

# 1. Clear old event key cache
curl -X POST /api/event-keys/clear-cache

# 2. Clean up old sync logs
# (Implementation depends on your logging system)

# 3. Optimize database
curl -X POST /api/database/optimize -d '{
  "optimizations": ["query_optimization"],
  "force_recreate": false
}'

# 4. Generate performance report
curl /api/event-keys/stats > "stats-$(date +%Y%m%d).json"
curl /api/database/performance > "db-perf-$(date +%Y%m%d).json"

echo "Weekly maintenance completed"
```

---

## 📈 Usage Analytics

### Track Your Sync Patterns

**Analyze sync frequency:**

```bash
# Get sync history and analyze patterns
curl /api/full-sync/history | jq '
  .jobs | group_by(.config.syncMode) |
  map({
    sync_mode: .[0].config.syncMode,
    count: length,
    avg_duration: (map(.duration_ms) | add / length),
    avg_records: (map(.summary.total_processed) | add / length)
  })
'
```

**Monitor data growth:**

```sql
-- Database query to track growth
SELECT
  DATE(created_at) as date,
  platform,
  COUNT(*) as events_added
FROM event_source
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), platform
ORDER BY date DESC;
```

---

**Last Updated**: January 2024  
**Guide Version**: 1.0.0
