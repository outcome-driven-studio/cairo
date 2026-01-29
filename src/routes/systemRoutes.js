const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { query } = require('../utils/db');

/**
 * GET /api/system/status
 * System health and status monitoring
 */
router.get('/status', async (req, res) => {
  try {
    const startTime = Date.now();

    // Database health check
    const dbHealth = await query('SELECT NOW() as current_time, version() as db_version');
    const dbResponseTime = Date.now() - startTime;

    // Get database size
    const dbSize = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

    // Get active connections
    const connections = await query(`
      SELECT count(*) as total FROM pg_stat_activity WHERE datname = current_database()
    `);

    // Get table count
    const tables = await query(`
      SELECT COUNT(*) as total FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'connected',
        responseTime: `${dbResponseTime}ms`,
        version: dbHealth.rows[0]?.db_version?.split(' ')[0] || 'unknown',
        size: dbSize.rows[0]?.size || 'unknown',
        connections: parseInt(connections.rows[0]?.total || 0),
        tables: parseInt(tables.rows[0]?.total || 0)
      },
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        },
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    logger.error('[System] Status check failed:', error);
    
    // Return partial data even if some queries fail
    res.status(200).json({
      success: false,
      error: error.message,
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'error',
        error: error.message
      },
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        },
        environment: process.env.NODE_ENV || 'development'
      }
    });
  }
});

/**
 * True only if the env value is set and not a placeholder (e.g. from .env.example).
 */
function isEnvConfigured(value) {
  if (value === undefined || value === null || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (v === 'placeholder') return false;
  if (/^your_.*_here$/i.test(v)) return false;
  if (/^https?:\/\/example\.com/i.test(v)) return false;
  return true;
}

/**
 * GET /api/system/integrations
 * Check status of all configured integrations (ignores placeholder / example values).
 */
router.get('/integrations', async (req, res) => {
  try {
    const integrations = {
      mixpanel: {
        name: 'Mixpanel',
        configured: isEnvConfigured(process.env.MIXPANEL_PROJECT_TOKEN),
        description: 'Event tracking and analytics'
      },
      lemlist: {
        name: 'Lemlist',
        configured: isEnvConfigured(process.env.LEMLIST_API_KEY),
        description: 'Cold email outreach platform'
      },
      smartlead: {
        name: 'Smartlead',
        configured: isEnvConfigured(process.env.SMARTLEAD_API_KEY),
        description: 'Email outreach automation'
      },
      attio: {
        name: 'Attio',
        configured: isEnvConfigured(process.env.ATTIO_API_KEY),
        description: 'CRM and relationship management'
      },
      apollo: {
        name: 'Apollo.io',
        configured: isEnvConfigured(process.env.APOLLO_API_KEY),
        description: 'B2B data enrichment'
      },
      hunter: {
        name: 'Hunter.io',
        configured: isEnvConfigured(process.env.HUNTER_API_KEY),
        description: 'Email finder and verification'
      },
      slack: {
        name: 'Slack',
        configured: isEnvConfigured(process.env.SLACK_WEBHOOK_URL),
        description: 'Notification and alerting',
      },
      discord: {
        name: 'Discord',
        configured: isEnvConfigured(process.env.DISCORD_WEBHOOK_URL),
        description: 'Notification and alerting'
      },
      sentry: {
        name: 'Sentry',
        configured: isEnvConfigured(process.env.SENTRY_DSN),
        description: 'Error tracking and monitoring'
      }
    };

    // Test connections for configured integrations
    for (const [key, integration] of Object.entries(integrations)) {
      if (integration.configured) {
        try {
          switch (key) {
            case 'mixpanel':
              integration.status = 'active';
              break;
            case 'lemlist':
            case 'smartlead':
            case 'attio':
            case 'apollo':
            case 'hunter':
            case 'slack':
            case 'discord':
            case 'sentry':
              integration.status = 'active';
              break;
            default:
              integration.status = 'unknown';
          }
        } catch (error) {
          integration.status = 'error';
          integration.error = error.message;
        }
      } else {
        integration.status = 'not_configured';
      }
    }

    const configured = Object.values(integrations).filter(i => i.configured).length;
    const active = Object.values(integrations).filter(i => i.status === 'active').length;

    res.json({
      success: true,
      summary: {
        total: Object.keys(integrations).length,
        configured,
        active,
        healthPercentage: configured > 0 ? Math.round((active / configured) * 100) : 0
      },
      integrations
    });
  } catch (error) {
    logger.error('[System] Integration check failed:', error);
    
    // Return basic integration info even on error (same placeholder logic)
    const basicIntegrations = {
      mixpanel: { name: 'Mixpanel', configured: isEnvConfigured(process.env.MIXPANEL_PROJECT_TOKEN), status: 'unknown', description: 'Event tracking and analytics' },
      lemlist: { name: 'Lemlist', configured: isEnvConfigured(process.env.LEMLIST_API_KEY), status: 'unknown', description: 'Cold email outreach platform' },
      smartlead: { name: 'Smartlead', configured: isEnvConfigured(process.env.SMARTLEAD_API_KEY), status: 'unknown', description: 'Email outreach automation' },
      attio: { name: 'Attio', configured: isEnvConfigured(process.env.ATTIO_API_KEY), status: 'unknown', description: 'CRM and relationship management' },
      apollo: { name: 'Apollo.io', configured: isEnvConfigured(process.env.APOLLO_API_KEY), status: 'unknown', description: 'B2B data enrichment' },
      hunter: { name: 'Hunter.io', configured: isEnvConfigured(process.env.HUNTER_API_KEY), status: 'unknown', description: 'Email finder and verification' },
      slack: { name: 'Slack', configured: isEnvConfigured(process.env.SLACK_WEBHOOK_URL), status: 'unknown', description: 'Notification and alerting' },
      discord: { name: 'Discord', configured: isEnvConfigured(process.env.DISCORD_WEBHOOK_URL), status: 'unknown', description: 'Notification and alerting' },
      sentry: { name: 'Sentry', configured: isEnvConfigured(process.env.SENTRY_DSN), status: 'unknown', description: 'Error tracking and monitoring' }
    };
    
    const configured = Object.values(basicIntegrations).filter(i => i.configured).length;
    
    res.status(200).json({
      success: false,
      error: error.message,
      summary: {
        total: Object.keys(basicIntegrations).length,
        configured,
        active: 0,
        healthPercentage: 0
      },
      integrations: basicIntegrations
    });
  }
});

/**
 * GET /api/system/tables
 * Get database table information
 */
router.get('/tables', async (req, res) => {
  try {
    const tables = await query(`
      SELECT 
        schemaname as schema,
        tablename as name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    // Get row counts for each table
    const tablesWithCounts = await Promise.all(
      tables.rows.map(async (table) => {
        try {
          const count = await query(`SELECT COUNT(*) as count FROM ${table.name}`);
          return {
            ...table,
            rows: parseInt(count.rows[0]?.count || 0)
          };
        } catch (error) {
          return {
            ...table,
            rows: 0,
            error: 'Unable to count'
          };
        }
      })
    );

    // Get total database stats
    const totalRows = tablesWithCounts.reduce((sum, t) => sum + t.rows, 0);
    const totalSize = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

    res.json({
      success: true,
      summary: {
        totalTables: tablesWithCounts.length,
        totalRows,
        totalSize: totalSize.rows[0]?.size || 'unknown'
      },
      tables: tablesWithCounts
    });
  } catch (error) {
    logger.error('[System] Table info failed:', error);
    res.status(200).json({
      success: false,
      error: error.message,
      summary: {
        totalTables: 0,
        totalRows: 0,
        totalSize: 'unknown'
      },
      tables: []
    });
  }
});

/**
 * GET /api/system/events/recent
 * Get recent system events/activity
 */
router.get('/events/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Check if event_source table exists
    const tableExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'event_source'
      )
    `);

    if (!tableExists.rows[0]?.exists) {
      // Return empty events if table doesn't exist
      return res.json({
        success: true,
        count: 0,
        events: [],
        message: 'No event tracking table found'
      });
    }

    // Get recent events from event_source table (columns: id, event_key, event_type, platform, user_id, metadata, created_at)
    const eventsResult = await query(`
      SELECT 
        id,
        event_type,
        platform,
        user_id,
        created_at,
        metadata
      FROM event_source
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    // Map to UI shape: add email from metadata if present, expose metadata as meta
    const events = eventsResult.rows.map((row) => {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const email = meta.email ?? meta.properties?.email;
      return {
        id: row.id,
        event_type: row.event_type,
        platform: row.platform,
        user_id: row.user_id,
        email: email || undefined,
        created_at: row.created_at,
        meta,
      };
    });

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    logger.error('[System] Recent events failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      count: 0,
      events: []
    });
  }
});

module.exports = router;
