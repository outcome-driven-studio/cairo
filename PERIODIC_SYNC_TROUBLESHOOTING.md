# Periodic Sync Troubleshooting Guide

## Overview

Cairo has two sync modes:

1. **Legacy Cron Jobs**: Run every 10-15 minutes
2. **Periodic Sync Service**: Runs every 4 hours (recommended)

## Quick Fix Steps

### 1. Enable Periodic Sync

Add these environment variables to your `.env` file:

```bash
# Enable periodic sync (recommended)
USE_PERIODIC_SYNC=true

# Set sync interval (default: 4 hours)
SYNC_INTERVAL_HOURS=4

# Run initial sync on startup
RUN_SYNC_ON_START=true

# Enable debug logging
PERIODIC_SYNC_HEARTBEAT=true
```

### 2. Test Mode

For immediate testing, enable test mode to sync every 2 minutes:

```bash
SYNC_TEST_MODE=true
```

### 3. Check Configuration

Run the diagnostic script:

```bash
node src/demo/periodicSyncDiagnostic.js
```

### 4. Monitor Logs

Look for these log messages:

```
[Server] Initializing PeriodicSyncService...
[PeriodicSync] Starting periodic sync every 4 hours
[PeriodicSync] Creating cron job with expression: 0 */4 * * *
[PeriodicSync] Cron job scheduled successfully
[PeriodicSync] Next sync scheduled for: [timestamp]
```

If heartbeat is enabled:

```
[PeriodicSync] Heartbeat - Service is running. Next sync: [timestamp]
```

When sync runs:

```
[PeriodicSync] Cron job triggered at [timestamp]
[PeriodicSync] Starting full sync run: sync_[timestamp]
```

## Common Issues

### Issue: No sync logs appearing

**Possible causes:**

1. `USE_PERIODIC_SYNC` not set to "true"
2. Both `USE_PERIODIC_SYNC` and `ENABLE_CRON_JOBS` are set (conflict)
3. API keys not configured

**Solution:**

- Check environment variables
- Ensure only one sync mode is enabled
- Verify API keys are set

### Issue: Sync not running at expected intervals

**Possible causes:**

1. Cron expression issue
2. Server timezone differences

**Solution:**

- Enable test mode to verify sync works
- Check server logs for cron scheduling
- Service uses UTC timezone by default

### Issue: Sync fails immediately

**Possible causes:**

1. Database connection issues
2. Missing API keys
3. Network connectivity

**Solution:**

- Check database connection
- Verify all required API keys
- Check network/firewall settings

## Manual Sync

If automatic sync isn't working, you can trigger manual sync:

```bash
# Using API endpoint
curl -X POST http://localhost:3000/api/periodic-sync/sync-now

# Check status
curl http://localhost:3000/api/periodic-sync/status
```

## Environment Variables Reference

| Variable                | Default | Description                     |
| ----------------------- | ------- | ------------------------------- |
| USE_PERIODIC_SYNC       | false   | Enable periodic sync service    |
| SYNC_INTERVAL_HOURS     | 4       | Hours between syncs             |
| RUN_SYNC_ON_START       | false   | Run sync immediately on startup |
| SYNC_TEST_MODE          | false   | Run every 2 minutes for testing |
| PERIODIC_SYNC_HEARTBEAT | false   | Log heartbeat every minute      |
| SYNC_FROM_LEMLIST       | true    | Enable Lemlist sync             |
| SYNC_FROM_SMARTLEAD     | true    | Enable Smartlead sync           |
| LEMLIST_API_KEY         | -       | Lemlist API key (required)      |
| SMARTLEAD_API_KEY       | -       | Smartlead API key (required)    |

## Debug Commands

```bash
# Check if periodic sync is running
node -e "const {getInstance} = require('./src/services/periodicSyncService'); console.log(getInstance().getStats())"

# Force sync now
node -e "const {getInstance} = require('./src/services/periodicSyncService'); getInstance().forceSync().then(console.log).catch(console.error)"
```
