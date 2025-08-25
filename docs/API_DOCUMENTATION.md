# 📚 Full Sync System - API Documentation

## 🎯 Overview

The Full Sync System provides comprehensive APIs for managing large-scale data synchronization between Smartlead, Lemlist, and your database. This documentation covers all endpoints, parameters, and usage examples.

## 📋 Table of Contents

- [Authentication](#authentication)
- [Full Sync APIs](#full-sync-apis)
- [Event Key APIs](#event-key-apis)
- [Database Optimization APIs](#database-optimization-apis)
- [Migration APIs](#migration-apis)
- [Background Job APIs](#background-job-apis)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)
- [Best Practices](#best-practices)

---

## 🔐 Authentication

All API endpoints require proper authentication. Include your API key in the request headers:

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

---

## 🔄 Full Sync APIs

### Execute Full Sync

Initiates a comprehensive synchronization process with configurable parameters.

**Endpoint:** `POST /api/full-sync/execute`

**Request Body:**

```json
{
  "platforms": "smartlead,lemlist",
  "syncMode": "full_historical",
  "namespaces": "production,staging",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "batchSize": 100,
  "enableProgressTracking": true,
  "enableMixpanelTracking": true,
  "enableAttioSync": true,
  "webhookUrl": "https://your-app.com/webhooks/sync-complete"
}
```

**Parameters:**

| Parameter                | Type         | Required    | Description                                                                       |
| ------------------------ | ------------ | ----------- | --------------------------------------------------------------------------------- |
| `platforms`              | string/array | Yes         | Comma-separated platforms: `smartlead`, `lemlist`                                 |
| `syncMode`               | string       | Yes         | Sync mode: `full_historical`, `delta_since_last`, `date_range`, `namespace_reset` |
| `namespaces`             | string/array | No          | Target namespaces for sync                                                        |
| `startDate`              | string       | Conditional | ISO date (required for `date_range` mode)                                         |
| `endDate`                | string       | Conditional | ISO date (required for `date_range` mode)                                         |
| `batchSize`              | number       | No          | Batch processing size (default: 50)                                               |
| `enableProgressTracking` | boolean      | No          | Enable real-time progress updates                                                 |
| `enableMixpanelTracking` | boolean      | No          | Enable event tracking in Mixpanel                                                 |
| `enableAttioSync`        | boolean      | No          | Enable person sync to Attio                                                       |
| `webhookUrl`             | string       | No          | Webhook for completion notification                                               |

**Response:**

```json
{
  "success": true,
  "jobId": "job_1234567890",
  "config": {
    "platforms": ["smartlead", "lemlist"],
    "syncMode": "full_historical",
    "namespaces": ["production"]
  },
  "estimatedDuration": "15 minutes",
  "progressUrl": "/api/full-sync/status/job_1234567890"
}
```

### Check Sync Status

Monitor the progress of a running sync operation.

**Endpoint:** `GET /api/full-sync/status/{jobId}`

**Response:**

```json
{
  "jobId": "job_1234567890",
  "status": "in_progress",
  "progress": {
    "percentage": 65,
    "processed_items": 6500,
    "total_items": 10000,
    "current_stage": "processing_smartlead_events",
    "eta_minutes": 8
  },
  "summary": {
    "events_created": 4200,
    "users_processed": 2300,
    "errors": 0,
    "duration_ms": 450000
  }
}
```

**Status Values:**

- `queued` - Job is waiting to be processed
- `in_progress` - Sync is actively running
- `completed` - Sync finished successfully
- `failed` - Sync encountered an error
- `cancelled` - Sync was manually cancelled

### Cancel Sync Operation

Cancel a running sync operation.

**Endpoint:** `DELETE /api/full-sync/cancel/{jobId}`

**Response:**

```json
{
  "success": true,
  "jobId": "job_1234567890",
  "status": "cancelled",
  "message": "Sync operation cancelled successfully"
}
```

---

## 🔑 Event Key APIs

### Generate Event Key

Generate a unique, collision-resistant event key.

**Endpoint:** `POST /api/event-keys/generate`

**Request Body:**

```json
{
  "platform": "lemlist",
  "campaignId": "campaign_123",
  "eventType": "email_sent",
  "email": "user@example.com",
  "activityId": "activity_456",
  "timestamp": "2024-01-15T10:30:00Z",
  "namespace": "production"
}
```

**Parameters:**

| Parameter    | Type   | Required | Description                                     |
| ------------ | ------ | -------- | ----------------------------------------------- |
| `platform`   | string | Yes      | Platform: `smartlead` or `lemlist`              |
| `campaignId` | string | Yes      | Campaign identifier                             |
| `eventType`  | string | Yes      | Event type (e.g., `email_sent`, `email_opened`) |
| `email`      | string | Yes      | User email address                              |
| `activityId` | string | No       | Activity/event identifier                       |
| `timestamp`  | string | No       | Event timestamp (ISO format)                    |
| `namespace`  | string | No       | Namespace for the event                         |

**Response:**

```json
{
  "success": true,
  "event_key": "lemlist_campaign123_emailsent_activity456_a1b2c3d4",
  "collision_detected": false,
  "generation_stats": {
    "total_generated": 1,
    "cache_size": 847,
    "collision_rate": "2.1%"
  }
}
```

### Event Key Statistics

Get performance statistics for event key generation.

**Endpoint:** `GET /api/event-keys/stats`

**Response:**

```json
{
  "success": true,
  "stats": {
    "total_generated": 156789,
    "collisions_detected": 234,
    "fallback_used": 12,
    "invalid_inputs": 3,
    "cache_size": 8472,
    "collision_rate": "0.15%",
    "generation_rate": "45,231 keys/sec"
  }
}
```

### Clear Event Key Cache

Clear the collision detection cache (use with caution in production).

**Endpoint:** `POST /api/event-keys/clear-cache`

**Response:**

```json
{
  "success": true,
  "message": "Event key cache cleared",
  "previous_cache_size": 8472
}
```

---

## 🗄️ Database Optimization APIs

### Initialize Optimizations

Apply database performance optimizations for sync operations.

**Endpoint:** `POST /api/database/optimize`

**Request Body:**

```json
{
  "optimizations": [
    "sync_indexes",
    "bulk_operations",
    "connection_pool",
    "query_optimization"
  ],
  "force_recreate": false
}
```

**Response:**

```json
{
  "success": true,
  "optimizations_applied": [
    "sync_indexes_created",
    "bulk_operations_initialized",
    "connection_pool_configured",
    "query_optimization_enabled"
  ],
  "performance_improvement": "28%",
  "indexes_created": 7,
  "bulk_statements_prepared": 2
}
```

### Database Performance Stats

Get current database performance metrics.

**Endpoint:** `GET /api/database/performance`

**Response:**

```json
{
  "success": true,
  "performance": {
    "connection_pool": {
      "active": 5,
      "idle": 15,
      "max": 20
    },
    "query_performance": {
      "avg_insert_time": "1.2ms",
      "avg_select_time": "0.8ms",
      "slow_queries": 0
    },
    "bulk_operations": {
      "events_per_batch": 100,
      "avg_batch_time": "15ms",
      "success_rate": "99.8%"
    }
  }
}
```

---

## 🔄 Migration APIs

### Migration Status

Check the status of database migrations.

**Endpoint:** `GET /api/migrations/status`

**Response:**

```json
{
  "success": true,
  "available_migrations": [
    "001_initial_schema",
    "002_sync_optimizations",
    "003_event_key_indexes",
    "004_performance_tuning"
  ],
  "applied_migrations": [
    "001_initial_schema",
    "002_sync_optimizations",
    "003_event_key_indexes"
  ],
  "pending_migrations": ["004_performance_tuning"]
}
```

### Run Migrations

Execute pending database migrations.

**Endpoint:** `POST /api/migrations/run`

**Request Body:**

```json
{
  "migrations": ["004_performance_tuning"],
  "dry_run": false
}
```

**Response:**

```json
{
  "success": true,
  "applied": ["004_performance_tuning"],
  "failed": [],
  "execution_time": "2.3s",
  "details": [
    {
      "migration": "004_performance_tuning",
      "status": "success",
      "execution_time": "2.3s"
    }
  ]
}
```

### Rollback Migration

Rollback the last applied migration.

**Endpoint:** `POST /api/migrations/rollback`

**Response:**

```json
{
  "success": true,
  "rolled_back": "004_performance_tuning",
  "execution_time": "1.8s"
}
```

---

## ⚙️ Background Job APIs

### Job Status

Check the status of background jobs.

**Endpoint:** `GET /api/jobs/status`

**Response:**

```json
{
  "success": true,
  "jobs": {
    "periodic_sync": {
      "enabled": true,
      "last_run": "2024-01-15T10:00:00Z",
      "next_run": "2024-01-15T11:00:00Z",
      "status": "healthy"
    },
    "mixpanel_sync": {
      "enabled": true,
      "last_run": "2024-01-15T10:30:00Z",
      "next_run": "2024-01-15T10:35:00Z",
      "status": "healthy"
    }
  }
}
```

### Manual Job Trigger

Manually trigger a background job.

**Endpoint:** `POST /api/jobs/trigger/{jobName}`

**Response:**

```json
{
  "success": true,
  "job_name": "periodic_sync",
  "triggered_at": "2024-01-15T10:45:00Z",
  "job_id": "manual_job_123"
}
```

---

## ❌ Error Codes

| Code       | Status | Description                  | Action                     |
| ---------- | ------ | ---------------------------- | -------------------------- |
| `SYNC_001` | 400    | Invalid sync configuration   | Check parameters           |
| `SYNC_002` | 404    | Sync job not found           | Verify job ID              |
| `SYNC_003` | 409    | Sync already in progress     | Wait or cancel existing    |
| `SYNC_004` | 429    | Rate limit exceeded          | Reduce request frequency   |
| `KEY_001`  | 400    | Invalid event key parameters | Check required fields      |
| `KEY_002`  | 500    | Key generation failed        | Retry or contact support   |
| `DB_001`   | 500    | Database connection failed   | Check database status      |
| `DB_002`   | 409    | Migration conflict           | Resolve conflicts manually |
| `API_001`  | 401    | Authentication required      | Include valid API key      |
| `API_002`  | 403    | Insufficient permissions     | Check API key permissions  |

---

## 🚦 Rate Limits

| Endpoint           | Limit         | Window   | Burst |
| ------------------ | ------------- | -------- | ----- |
| Full Sync Execute  | 10 requests   | 1 hour   | 3     |
| Event Key Generate | 1000 requests | 1 minute | 100   |
| Database Optimize  | 5 requests    | 1 hour   | 2     |
| Migration Run      | 3 requests    | 1 hour   | 1     |
| Status/Stats       | 100 requests  | 1 minute | 20    |

**Rate Limit Headers:**

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 856
X-RateLimit-Reset: 1642694400
```

---

## 📋 Best Practices

### 🔄 Full Sync Operations

1. **Start Small**: Begin with small namespaces to test configuration
2. **Monitor Progress**: Always enable progress tracking for long operations
3. **Use Webhooks**: Configure webhook URLs for completion notifications
4. **Schedule Wisely**: Run large syncs during off-peak hours
5. **Batch Sizing**: Use appropriate batch sizes (50-200) based on data volume

### 🔑 Event Key Generation

1. **Cache Management**: Monitor cache size and clear when necessary
2. **Collision Monitoring**: Set alerts for collision rates > 5%
3. **Consistent Format**: Use consistent data formats across platforms
4. **Error Handling**: Implement retry logic for generation failures
5. **Performance Monitoring**: Track generation rates and optimize as needed

### 🗄️ Database Operations

1. **Index Maintenance**: Apply optimizations before large sync operations
2. **Connection Pooling**: Monitor pool usage and adjust as needed
3. **Migration Safety**: Test migrations in staging before production
4. **Performance Monitoring**: Track query performance and optimize slow queries
5. **Backup Strategy**: Ensure backups before major migrations

### ⚙️ Background Jobs

1. **Health Monitoring**: Regularly check job status and health
2. **Error Alerting**: Set up alerts for job failures
3. **Resource Management**: Monitor CPU and memory usage
4. **Graceful Shutdowns**: Implement proper shutdown procedures
5. **Logging**: Maintain detailed logs for troubleshooting

### 🔒 Security

1. **API Key Rotation**: Regularly rotate API keys
2. **Access Control**: Use least-privilege principle
3. **Audit Logging**: Log all API access and changes
4. **Data Encryption**: Ensure data is encrypted in transit and at rest
5. **Rate Limiting**: Implement and monitor rate limits

### 📊 Monitoring

1. **Performance Metrics**: Track API response times and error rates
2. **Sync Metrics**: Monitor sync success rates and data volumes
3. **Database Metrics**: Track connection pool, query performance
4. **Alert Setup**: Configure alerts for critical issues
5. **Dashboard Creation**: Build monitoring dashboards for operations team

---

## 🎯 Example Use Cases

### Complete Full Sync Workflow

```javascript
// 1. Execute full sync
const syncResponse = await fetch("/api/full-sync/execute", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    platforms: "smartlead,lemlist",
    syncMode: "full_historical",
    namespaces: "production",
    batchSize: 100,
    enableProgressTracking: true,
    webhookUrl: "https://your-app.com/sync-complete",
  }),
});

const { jobId } = await syncResponse.json();

// 2. Monitor progress
const checkProgress = async () => {
  const status = await fetch(`/api/full-sync/status/${jobId}`);
  const progress = await status.json();

  if (progress.status === "completed") {
    console.log("Sync completed successfully!");
    console.log(`Events created: ${progress.summary.events_created}`);
  } else if (progress.status === "in_progress") {
    console.log(`Progress: ${progress.progress.percentage}%`);
    setTimeout(checkProgress, 5000); // Check again in 5 seconds
  }
};

checkProgress();
```

### Event Key Generation with Collision Handling

```javascript
const generateEventKey = async (eventData) => {
  try {
    const response = await fetch("/api/event-keys/generate", {
      method: "POST",
      headers: {
        Authorization: "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    });

    const result = await response.json();

    if (result.collision_detected) {
      console.warn("Collision detected and resolved:", result.event_key);
    }

    return result.event_key;
  } catch (error) {
    console.error("Key generation failed:", error);
    throw error;
  }
};
```

### Database Optimization Setup

```javascript
// Apply optimizations before large sync
const optimizeDatabase = async () => {
  const response = await fetch("/api/database/optimize", {
    method: "POST",
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      optimizations: ["sync_indexes", "bulk_operations"],
      force_recreate: false,
    }),
  });

  const result = await response.json();
  console.log(`Performance improved by ${result.performance_improvement}`);

  return result.success;
};
```

---

## 📞 Support

For additional support or questions:

- **Documentation**: [Full Documentation](../README.md)
- **Issues**: Create an issue on GitHub
- **Performance**: Check [Performance Guide](./PERFORMANCE_GUIDE.md)
- **Troubleshooting**: See [Troubleshooting Guide](./TROUBLESHOOTING.md)

---

**Last Updated**: January 2024  
**API Version**: v1.0  
**Documentation Version**: 1.0.0
