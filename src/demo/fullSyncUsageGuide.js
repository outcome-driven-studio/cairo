#!/usr/bin/env node
/**
 * Full Sync System Usage Guide
 *
 * Comprehensive guide showing how to use the full sync system
 * with practical examples for common scenarios.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");

console.log("📖 Full Sync System Usage Guide");
console.log("=".repeat(60));
console.log("");

/**
 * Show usage examples for different scenarios
 */
function showUsageExamples() {
  console.log("🎯 Common Usage Scenarios");
  console.log("-".repeat(40));

  // Scenario 1: Full Historical Sync
  console.log("\n1️⃣  Full Historical Sync - Sync All Historical Data");
  console.log("   Use when: Starting fresh or want to sync everything");
  console.log(
    "   ⚠️  Warning: May take a long time and use significant API quota"
  );

  const fullHistoricalExample = {
    mode: SYNC_MODES.FULL_HISTORICAL,
    platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
    namespaces: "all", // or specific: ["playmaker", "client1"]
    batchSize: 50,
    enableMixpanelTracking: true,
  };
  console.log("   📝 Configuration:");
  console.log(JSON.stringify(fullHistoricalExample, null, 6));

  // Scenario 2: Date Range Sync
  console.log("\n2️⃣  Date Range Sync - Sync Specific Time Period");
  console.log("   Use when: Need data from a specific time period");
  console.log("   ✅ Recommended for controlled, predictable syncs");

  const dateRangeExample = {
    mode: SYNC_MODES.DATE_RANGE,
    platforms: [PLATFORMS.SMARTLEAD],
    namespaces: ["playmaker"],
    dateRange: {
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-31T23:59:59.999Z",
    },
    batchSize: 100,
    enableMixpanelTracking: true,
  };
  console.log("   📝 Configuration:");
  console.log(JSON.stringify(dateRangeExample, null, 6));

  // Scenario 3: Reset and Sync
  console.log("\n3️⃣  Reset and Sync - Reset Timestamps and Sync From Date");
  console.log(
    "   Use when: Want to re-sync from a specific date going forward"
  );
  console.log(
    "   💡 Tip: Useful for fixing sync issues or changing sync strategy"
  );

  const resetSyncExample = {
    mode: SYNC_MODES.RESET_FROM_DATE,
    platforms: [PLATFORMS.LEMLIST],
    namespaces: ["client1", "client2"],
    resetDate: "2024-02-01T00:00:00.000Z",
    batchSize: 75,
    rateLimitDelay: 1000,
  };
  console.log("   📝 Configuration:");
  console.log(JSON.stringify(resetSyncExample, null, 6));

  console.log("\n" + "=".repeat(60));
}

/**
 * Show API usage examples
 */
function showApiUsage() {
  console.log("\n🌐 API Usage Examples");
  console.log("-".repeat(40));

  console.log("\n📤 Synchronous Execution (GET RESULTS IMMEDIATELY):");
  console.log("   POST /api/full-sync/execute");
  console.log("   Content-Type: application/json");
  console.log("");
  console.log("   Request Body:");
  console.log(`   {
     "mode": "${SYNC_MODES.DATE_RANGE}",
     "platforms": ["${PLATFORMS.SMARTLEAD}"],
     "namespaces": ["playmaker"],
     "dateRange": {
       "start": "2024-01-01T00:00:00.000Z",
       "end": "2024-01-07T23:59:59.999Z"
     },
     "batchSize": 50,
     "enableMixpanelTracking": true
   }`);

  console.log("\n⚡ Asynchronous Execution (BACKGROUND JOB):");
  console.log("   POST /api/full-sync/execute-async");
  console.log("   Content-Type: application/json");
  console.log("");
  console.log("   Request Body:");
  console.log(`   {
     "mode": "${SYNC_MODES.FULL_HISTORICAL}",
     "platforms": ["${PLATFORMS.SMARTLEAD}", "${PLATFORMS.LEMLIST}"],
     "namespaces": "all",
     "batchSize": 100,
     "callbackUrl": "https://your-app.com/webhooks/sync-complete"
   }`);

  console.log("\n🔍 Check Job Status:");
  console.log("   GET /api/full-sync/status/{jobId}");
  console.log("");
  console.log("   Response Example:");
  console.log(`   {
     "success": true,
     "data": {
       "id": "full-sync-1234567890",
       "status": "completed",
       "result": {
         "success": true,
         "summary": {
           "totalUsers": 1250,
           "totalEvents": 8900,
           "totalErrors": 0
         }
       },
       "duration": 45.2
     }
   }`);

  console.log("\n🏥 System Health Check:");
  console.log("   GET /api/full-sync/health");

  console.log("\n📋 Job History:");
  console.log("   GET /api/full-sync/jobs?limit=20&status=completed");

  console.log("\n✅ Configuration Validation:");
  console.log("   POST /api/full-sync/config/validate");
  console.log("   (Same request body as execute endpoints)");

  console.log("\n🏷️  Available Namespaces:");
  console.log("   GET /api/full-sync/namespaces");

  console.log("\n" + "=".repeat(60));
}

/**
 * Show curl command examples
 */
function showCurlExamples() {
  console.log("\n💻 Curl Command Examples");
  console.log("-".repeat(40));

  console.log("\n🔍 Health Check:");
  console.log(`curl -X GET http://localhost:8080/api/full-sync/health`);

  console.log("\n📋 Get Namespaces:");
  console.log(`curl -X GET http://localhost:8080/api/full-sync/namespaces`);

  console.log("\n✅ Validate Configuration:");
  console.log(`curl -X POST http://localhost:8080/api/full-sync/config/validate \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "DATE_RANGE",
    "platforms": ["smartlead"],
    "namespaces": ["playmaker"],
    "dateRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    }
  }'`);

  console.log("\n⚡ Execute Async Full Sync:");
  console.log(`curl -X POST http://localhost:8080/api/full-sync/execute-async \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "FULL_HISTORICAL",
    "platforms": ["smartlead", "lemlist"],
    "namespaces": "all",
    "batchSize": 100,
    "enableMixpanelTracking": true
  }'`);

  console.log("\n🔍 Check Job Status:");
  console.log(
    `curl -X GET http://localhost:8080/api/full-sync/status/full-sync-1234567890`
  );

  console.log("\n📊 Get Job History:");
  console.log(
    `curl -X GET "http://localhost:8080/api/full-sync/jobs?limit=10&status=all"`
  );

  console.log("\n" + "=".repeat(60));
}

/**
 * Show production deployment tips
 */
function showProductionTips() {
  console.log("\n🚀 Production Deployment Tips");
  console.log("-".repeat(40));

  console.log(`
🔧 ENVIRONMENT VARIABLES NEEDED:
   ✅ DATABASE_URL - PostgreSQL connection
   ✅ LEMLIST_API_KEY - Your Lemlist API key
   ✅ SMARTLEAD_API_KEY - Your Smartlead API key
   ✅ ATTIO_API_KEY - Your Attio API key (optional)
   ✅ MIXPANEL_PROJECT_TOKEN - For event tracking (optional)

⚙️  RAILWAY DEPLOYMENT:
   1. Enable USE_PERIODIC_SYNC=true for background sync
   2. Set SYNC_INTERVAL_HOURS=4 (recommended)
   3. Configure all API keys in Railway environment
   4. Monitor logs with: railway logs --tail

📊 MONITORING RECOMMENDATIONS:
   • Monitor /api/full-sync/health endpoint
   • Set up alerts for failed sync jobs
   • Track API rate limit usage
   • Monitor database performance during large syncs

⚡ PERFORMANCE OPTIMIZATION:
   • Start with batchSize: 50-100 for testing
   • Increase batch size gradually based on API response
   • Use DATE_RANGE mode for regular syncs
   • Use FULL_HISTORICAL sparingly (high API usage)

🔒 SECURITY CONSIDERATIONS:
   • API endpoints are currently open (no auth)
   • Consider adding API key authentication in production
   • Monitor for abuse of bulk sync endpoints
   • Set up rate limiting at the reverse proxy level
`);

  console.log("\n" + "=".repeat(60));
}

/**
 * Show troubleshooting guide
 */
function showTroubleshooting() {
  console.log("\n🔧 Troubleshooting Guide");
  console.log("-".repeat(40));

  console.log(`
❌ COMMON ISSUES & SOLUTIONS:

1. "Invalid sync mode" Error
   ✅ Use: FULL_HISTORICAL, DATE_RANGE, or RESET_FROM_DATE
   
2. "No target namespaces found"
   ✅ Check /api/full-sync/namespaces for available namespaces
   ✅ Ensure namespaces are active in database
   
3. API Rate Limit Exceeded
   ✅ Reduce batchSize (try 25-50)
   ✅ Increase rateLimitDelay (try 1000-2000ms)
   ✅ Check API quota with your provider
   
4. Sync Takes Too Long
   ✅ Use DATE_RANGE instead of FULL_HISTORICAL
   ✅ Sync specific namespaces instead of "all"
   ✅ Consider multiple smaller syncs
   
5. Job Status "failed"
   ✅ Check /api/full-sync/jobs for error details
   ✅ Validate API keys are correct
   ✅ Ensure database connectivity
   
6. Missing Environment Variables
   ✅ Copy .env.example to .env
   ✅ Fill in all required API keys
   ✅ Restart the application

🔍 DEBUG MODE:
   Set LOG_LEVEL=debug in environment for detailed logs
   
📞 HEALTH CHECK:
   GET /api/full-sync/health shows system status
   Check rateLimiters.*.ready status for API health
`);

  console.log("\n" + "=".repeat(60));
}

/**
 * Show integration examples
 */
function showIntegrationExamples() {
  console.log("\n🔗 Integration Examples");
  console.log("-".repeat(40));

  console.log("\n📱 JavaScript/Node.js:");
  console.log(`
const axios = require('axios');

async function runFullSync() {
  try {
    // Start async sync
    const response = await axios.post('http://localhost:8080/api/full-sync/execute-async', {
      mode: 'DATE_RANGE',
      platforms: ['smartlead'],
      namespaces: ['playmaker'],
      dateRange: {
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-31T23:59:59.999Z'
      },
      batchSize: 50,
      callbackUrl: 'https://myapp.com/sync-webhook'
    });

    const jobId = response.data.data.jobId;
    console.log('Sync started:', jobId);

    // Poll for completion
    let completed = false;
    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const status = await axios.get(\`http://localhost:8080/api/full-sync/status/\${jobId}\`);
      console.log('Status:', status.data.data.status);
      
      if (['completed', 'failed', 'cancelled'].includes(status.data.data.status)) {
        completed = true;
        console.log('Final result:', status.data.data.result);
      }
    }
  } catch (error) {
    console.error('Sync failed:', error.response?.data || error.message);
  }
}
`);

  console.log("\n🐍 Python:");
  console.log(`
import requests
import time

def run_full_sync():
    try:
        # Start async sync
        response = requests.post('http://localhost:8080/api/full-sync/execute-async', 
            json={
                'mode': 'DATE_RANGE',
                'platforms': ['smartlead'],
                'namespaces': ['playmaker'],
                'dateRange': {
                    'start': '2024-01-01T00:00:00.000Z',
                    'end': '2024-01-31T23:59:59.999Z'
                },
                'batchSize': 50
            })
        
        job_id = response.json()['data']['jobId']
        print(f'Sync started: {job_id}')
        
        # Poll for completion
        while True:
            time.sleep(5)
            status_response = requests.get(f'http://localhost:8080/api/full-sync/status/{job_id}')
            status = status_response.json()['data']['status']
            print(f'Status: {status}')
            
            if status in ['completed', 'failed', 'cancelled']:
                print(f'Final result: {status_response.json()["data"]["result"]}')
                break
                
    except requests.exceptions.RequestException as e:
        print(f'Sync failed: {e}')
`);

  console.log("\n🌐 React/Frontend:");
  console.log(`
import React, { useState, useEffect } from 'react';

function FullSyncComponent() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);

  const startSync = async () => {
    try {
      const response = await fetch('/api/full-sync/execute-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'DATE_RANGE',
          platforms: ['smartlead'],
          namespaces: ['playmaker'],
          dateRange: {
            start: '2024-01-01T00:00:00.000Z',
            end: '2024-01-31T23:59:59.999Z'
          },
          batchSize: 50
        })
      });

      const data = await response.json();
      setJobId(data.data.jobId);
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(\`/api/full-sync/status/\${jobId}\`);
        const data = await response.json();
        
        setStatus(data.data.status);
        
        if (['completed', 'failed', 'cancelled'].includes(data.data.status)) {
          setResult(data.data.result);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Failed to check status:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div>
      <button onClick={startSync} disabled={!!jobId}>
        Start Full Sync
      </button>
      
      {status && <p>Status: {status}</p>}
      {result && (
        <div>
          <h3>Sync Results:</h3>
          <p>Success: {result.success ? 'Yes' : 'No'}</p>
          <p>Users: {result.summary?.totalUsers}</p>
          <p>Events: {result.summary?.totalEvents}</p>
        </div>
      )}
    </div>
  );
}
`);

  console.log("\n" + "=".repeat(60));
}

// Run the usage guide
console.log("Welcome to the Full Sync System! 🚀");
console.log("");
console.log(
  "This system allows you to synchronize hundreds of thousands of records"
);
console.log(
  "from Smartlead and Lemlist with flexible date range control, namespace"
);
console.log("filtering, and comprehensive progress tracking.");
console.log("");

showUsageExamples();
showApiUsage();
showCurlExamples();
showProductionTips();
showTroubleshooting();
showIntegrationExamples();

console.log("🎉 Full Sync System Usage Guide Complete!");
console.log("");
console.log("📚 For more information:");
console.log("   • Check the /api/full-sync/health endpoint for system status");
console.log("   • Use /api/full-sync/config/validate to test configurations");
console.log("   • Monitor /api/full-sync/jobs for operation history");
console.log("");
console.log("🚀 Ready to sync hundreds of thousands of records efficiently!");

module.exports = {
  showUsageExamples,
  showApiUsage,
  showCurlExamples,
  showProductionTips,
  showTroubleshooting,
  showIntegrationExamples,
};
