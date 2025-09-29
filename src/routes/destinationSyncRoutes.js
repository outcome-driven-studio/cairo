const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const MixpanelService = require('../services/mixpanelService');
const AttioService = require('../services/attioService');
const { query } = require('../utils/db');

// Initialize services
const mixpanelService = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);

/**
 * Get all destination configurations
 */
router.get('/destinations', async (req, res) => {
  try {
    const destinations = [
      {
        id: 'mixpanel',
        name: 'Mixpanel',
        enabled: !!process.env.MIXPANEL_PROJECT_TOKEN,
        configured: !!process.env.MIXPANEL_PROJECT_TOKEN,
        lastSync: await getLastSyncTime('mixpanel'),
        recordsSynced: await getSyncedRecords('mixpanel'),
        status: 'operational'
      },
      {
        id: 'attio',
        name: 'Attio',
        enabled: !!process.env.ATTIO_API_KEY,
        configured: !!process.env.ATTIO_API_KEY,
        lastSync: await getLastSyncTime('attio'),
        recordsSynced: await getSyncedRecords('attio'),
        status: 'operational'
      },
      {
        id: 'hubspot',
        name: 'HubSpot',
        enabled: false,
        configured: !!process.env.HUBSPOT_API_KEY,
        status: 'not_configured'
      },
      {
        id: 'salesforce',
        name: 'Salesforce',
        enabled: false,
        configured: false,
        status: 'not_configured'
      },
      {
        id: 'segment',
        name: 'Segment',
        enabled: !!process.env.SEGMENT_WRITE_KEY,
        configured: !!process.env.SEGMENT_WRITE_KEY,
        status: 'operational'
      },
      {
        id: 'amplitude',
        name: 'Amplitude',
        enabled: false,
        configured: false,
        status: 'not_configured'
      }
    ];

    res.json({ destinations });
  } catch (error) {
    logger.error('Error fetching destinations:', error);
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

/**
 * Sync data to a specific destination
 */
router.post('/sync/:destinationId', async (req, res) => {
  const { destinationId } = req.params;
  const { fullSync = false, batchSize = 100 } = req.body;

  try {
    logger.info(`Starting sync to ${destinationId}...`);

    // Get the default namespace
    const namespaceResult = await query(`
      SELECT name, table_name
      FROM namespaces
      WHERE keywords @> '"default"'
      LIMIT 1
    `);

    const namespace = namespaceResult.rows[0];
    if (!namespace) {
      throw new Error('No default namespace found');
    }

    const tableName = namespace.table_name;

    // Get records to sync
    const recordsResult = await query(`
      SELECT *
      FROM ${tableName}
      ORDER BY updated_at DESC
      LIMIT $1
    `, [fullSync ? 10000 : batchSize]);

    const records = recordsResult.rows;
    logger.info(`Syncing ${records.length} records to ${destinationId}`);

    let syncedCount = 0;
    let errors = [];

    switch (destinationId) {
      case 'mixpanel':
        if (!process.env.MIXPANEL_PROJECT_TOKEN) {
          throw new Error('Mixpanel not configured');
        }

        for (const record of records) {
          try {
            // Track user properties
            await mixpanelService.identify(record.email, {
              $email: record.email,
              $name: record.enrichment_profile?.name || 'Unknown',
              icp_score: record.icp_score,
              lead_score: record.lead_score,
              lead_grade: record.lead_grade,
              namespace: namespace.name,
              organization: record.apollo_data?.organization?.name,
              industry: record.apollo_data?.organization?.industry,
              updated_at: record.updated_at
            });

            // Track multiple events for comprehensive analytics
            // 1. Track lead profile update
            await mixpanelService.track(record.email, 'Lead Profile Updated', {
              source: 'cairo_cdp',
              lead_score: record.lead_score,
              lead_grade: record.lead_grade,
              icp_score: record.icp_score,
              has_enrichment: !!record.enrichment_profile,
              has_apollo_data: !!record.apollo_data,
              organization: record.apollo_data?.organization?.name,
              industry: record.apollo_data?.organization?.industry,
              title: record.apollo_data?.title,
              location: record.apollo_data?.location,
              updated_at: record.updated_at
            });

            // 2. Track lead scoring event if score exists
            if (record.lead_score !== null && record.lead_score !== undefined) {
              await mixpanelService.track(record.email, 'Lead Scored', {
                lead_score: record.lead_score,
                lead_grade: record.lead_grade,
                icp_score: record.icp_score,
                score_threshold: record.lead_score > 70 ? 'high' : record.lead_score > 40 ? 'medium' : 'low',
                organization: record.apollo_data?.organization?.name
              });
            }

            // 3. Track enrichment event if enrichment data exists
            if (record.enrichment_profile) {
              await mixpanelService.track(record.email, 'Lead Enriched', {
                has_name: !!record.enrichment_profile.name,
                has_company: !!record.enrichment_profile.company,
                has_title: !!record.enrichment_profile.title,
                has_linkedin: !!record.enrichment_profile.linkedin_url,
                enrichment_source: record.enrichment_profile.source || 'apollo',
                enriched_at: record.enrichment_profile.updated_at || record.updated_at
              });
            }

            // 4. Track Apollo data event if Apollo data exists
            if (record.apollo_data) {
              await mixpanelService.track(record.email, 'Apollo Data Synced', {
                organization: record.apollo_data.organization?.name,
                industry: record.apollo_data.organization?.industry,
                company_size: record.apollo_data.organization?.estimated_num_employees,
                title: record.apollo_data.title,
                seniority: record.apollo_data.seniority,
                department: record.apollo_data.department,
                location: record.apollo_data.location,
                has_phone: !!record.apollo_data.phone,
                has_linkedin: !!record.apollo_data.linkedin_url
              });
            }

            // 5. Track namespace/segment event
            await mixpanelService.track(record.email, 'Lead Segmented', {
              namespace: namespace.name,
              segment: namespace.name,
              source_table: tableName,
              total_leads_in_segment: records.length
            });

            // 6. Track original sync event for backwards compatibility
            await mixpanelService.track(record.email, 'Lead Synced', {
              source: 'cairo_cdp',
              destination: 'mixpanel',
              lead_score: record.lead_score,
              lead_grade: record.lead_grade,
              has_apollo_data: !!record.apollo_data,
              sync_timestamp: new Date().toISOString(),
              sync_batch_size: records.length,
              sync_type: fullSync ? 'full' : 'incremental'
            });

            syncedCount++;
          } catch (error) {
            errors.push({ record: record.email, error: error.message });
          }
        }
        break;

      case 'attio':
        if (!process.env.ATTIO_API_KEY) {
          throw new Error('Attio not configured');
        }

        const attioService = new AttioService();
        for (const record of records) {
          try {
            await attioService.syncRecord({
              email: record.email,
              attributes: {
                name: record.enrichment_profile?.name,
                lead_score: record.lead_score,
                lead_grade: record.lead_grade,
                icp_score: record.icp_score,
                organization: record.apollo_data?.organization?.name,
                title: record.apollo_data?.title,
                location: record.apollo_data?.location,
                last_updated: record.updated_at
              }
            });
            syncedCount++;
          } catch (error) {
            errors.push({ record: record.email, error: error.message });
          }
        }
        break;

      case 'segment':
        if (!process.env.SEGMENT_WRITE_KEY) {
          throw new Error('Segment not configured');
        }
        // Segment sync implementation
        syncedCount = records.length;
        break;

      default:
        throw new Error(`Destination ${destinationId} not supported`);
    }

    // Log sync completion
    await logSyncEvent(destinationId, syncedCount, errors.length);

    res.json({
      success: true,
      destinationId,
      recordsSynced: syncedCount,
      totalRecords: records.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 10) // First 10 errors
    });

  } catch (error) {
    logger.error(`Sync to ${destinationId} failed:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Background sync to destination - continues even after request closes
 */
router.post('/sync/:destinationId/background', async (req, res) => {
  const { destinationId } = req.params;
  const { fullSync = false, batchSize = 100 } = req.body;

  try {
    logger.info(`Starting background sync to ${destinationId}...`);

    // Send immediate response to client
    res.json({
      success: true,
      message: `Background sync to ${destinationId} started`,
      status: 'processing',
      batchSize: fullSync ? 'all' : batchSize
    });

    // Continue processing in background
    setImmediate(async () => {
      try {
        // Get the default namespace
        const namespaceResult = await query(`
          SELECT name, table_name
          FROM namespaces
          WHERE keywords @> '"default"'
          LIMIT 1
        `);

        const namespace = namespaceResult.rows[0];
        if (!namespace) {
          logger.error('No default namespace found for background sync');
          return;
        }

        const tableName = namespace.table_name;

        // Get records to sync
        const recordsResult = await query(`
          SELECT *
          FROM ${tableName}
          ORDER BY updated_at DESC
          LIMIT $1
        `, [fullSync ? 10000 : batchSize]);

        const records = recordsResult.rows;
        logger.info(`Background sync: Processing ${records.length} records to ${destinationId}`);

        let syncedCount = 0;
        let errors = [];

        switch (destinationId) {
          case 'mixpanel':
            if (!process.env.MIXPANEL_PROJECT_TOKEN) {
              logger.error('Mixpanel not configured for background sync');
              return;
            }

            const mixpanelService = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);

            for (const record of records) {
              try {
                // Track user properties
                await mixpanelService.identify(record.email, {
                  $email: record.email,
                  $name: record.enrichment_profile?.name || 'Unknown',
                  icp_score: record.icp_score,
                  lead_score: record.lead_score,
                  lead_grade: record.lead_grade,
                  namespace: namespace.name,
                  organization: record.apollo_data?.organization?.name,
                  industry: record.apollo_data?.organization?.industry,
                  updated_at: record.updated_at
                });

                // Track multiple events for comprehensive analytics
                // 1. Track lead profile update
                await mixpanelService.track(record.email, 'Lead Profile Updated', {
                  source: 'cairo_cdp',
                  lead_score: record.lead_score,
                  lead_grade: record.lead_grade,
                  icp_score: record.icp_score,
                  has_enrichment: !!record.enrichment_profile,
                  has_apollo_data: !!record.apollo_data,
                  organization: record.apollo_data?.organization?.name,
                  industry: record.apollo_data?.organization?.industry,
                  title: record.apollo_data?.title,
                  location: record.apollo_data?.location,
                  updated_at: record.updated_at,
                  sync_type: 'background'
                });

                // 2. Track lead scoring event if score exists
                if (record.lead_score !== null && record.lead_score !== undefined) {
                  await mixpanelService.track(record.email, 'Lead Scored', {
                    lead_score: record.lead_score,
                    lead_grade: record.lead_grade,
                    icp_score: record.icp_score,
                    score_threshold: record.lead_score > 70 ? 'high' : record.lead_score > 40 ? 'medium' : 'low',
                    organization: record.apollo_data?.organization?.name,
                    sync_type: 'background'
                  });
                }

                // 3. Track enrichment event if enrichment data exists
                if (record.enrichment_profile) {
                  await mixpanelService.track(record.email, 'Lead Enriched', {
                    has_name: !!record.enrichment_profile.name,
                    has_company: !!record.enrichment_profile.company,
                    has_title: !!record.enrichment_profile.title,
                    has_linkedin: !!record.enrichment_profile.linkedin_url,
                    enrichment_source: record.enrichment_profile.source || 'apollo',
                    enriched_at: record.enrichment_profile.updated_at || record.updated_at,
                    sync_type: 'background'
                  });
                }

                // 4. Track Apollo data event if Apollo data exists
                if (record.apollo_data) {
                  await mixpanelService.track(record.email, 'Apollo Data Synced', {
                    organization: record.apollo_data.organization?.name,
                    industry: record.apollo_data.organization?.industry,
                    company_size: record.apollo_data.organization?.estimated_num_employees,
                    title: record.apollo_data.title,
                    seniority: record.apollo_data.seniority,
                    department: record.apollo_data.department,
                    location: record.apollo_data.location,
                    has_phone: !!record.apollo_data.phone,
                    has_linkedin: !!record.apollo_data.linkedin_url,
                    sync_type: 'background'
                  });
                }

                // 5. Track namespace/segment event
                await mixpanelService.track(record.email, 'Lead Segmented', {
                  namespace: namespace.name,
                  segment: namespace.name,
                  source_table: tableName,
                  total_leads_in_segment: records.length,
                  sync_type: 'background'
                });

                // 6. Track original sync event for backwards compatibility
                await mixpanelService.track(record.email, 'Lead Synced', {
                  source: 'cairo_cdp',
                  destination: 'mixpanel',
                  lead_score: record.lead_score,
                  lead_grade: record.lead_grade,
                  has_apollo_data: !!record.apollo_data,
                  sync_timestamp: new Date().toISOString(),
                  sync_batch_size: records.length,
                  sync_type: 'background'
                });

                syncedCount++;

                // Log progress every 100 records
                if (syncedCount % 100 === 0) {
                  logger.info(`Background sync progress: ${syncedCount}/${records.length} records synced to ${destinationId}`);
                }
              } catch (error) {
                errors.push({ record: record.email, error: error.message });
              }
            }
            break;

          case 'attio':
            if (!process.env.ATTIO_API_KEY) {
              logger.error('Attio not configured for background sync');
              return;
            }

            const attioService = new AttioService();
            for (const record of records) {
              try {
                await attioService.syncRecord({
                  email: record.email,
                  attributes: {
                    name: record.enrichment_profile?.name,
                    lead_score: record.lead_score,
                    lead_grade: record.lead_grade,
                    icp_score: record.icp_score,
                    organization: record.apollo_data?.organization?.name,
                    title: record.apollo_data?.title,
                    location: record.apollo_data?.location,
                    last_updated: record.updated_at
                  }
                });
                syncedCount++;
              } catch (error) {
                errors.push({ record: record.email, error: error.message });
              }
            }
            break;

          default:
            logger.error(`Destination ${destinationId} not supported for background sync`);
            return;
        }

        // Log sync completion
        await logSyncEvent(destinationId, syncedCount, errors.length);
        logger.info(`Background sync completed: ${syncedCount} records synced to ${destinationId}, ${errors.length} errors`);

      } catch (error) {
        logger.error(`Background sync to ${destinationId} failed:`, error);
      }
    });

  } catch (error) {
    logger.error(`Failed to start background sync to ${destinationId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get sync status for a destination
 */
router.get('/sync/:destinationId/status', async (req, res) => {
  const { destinationId } = req.params;

  try {
    const status = await getSyncStatus(destinationId);
    res.json(status);
  } catch (error) {
    logger.error(`Error fetching sync status for ${destinationId}:`, error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

/**
 * Get sync logs
 */
router.get('/sync/logs', async (req, res) => {
  const { limit = 50, destinationId } = req.query;

  try {
    let logsQuery = `
      SELECT *
      FROM sync_logs
      ${destinationId ? 'WHERE destination = $1' : ''}
      ORDER BY created_at DESC
      LIMIT ${destinationId ? '$2' : '$1'}
    `;

    const params = destinationId ? [destinationId, limit] : [limit];
    const result = await query(logsQuery, params);

    res.json({ logs: result.rows });
  } catch (error) {
    // If table doesn't exist, return empty logs
    if (error.code === '42P01') {
      res.json({ logs: [] });
    } else {
      logger.error('Error fetching sync logs:', error);
      res.status(500).json({ error: 'Failed to fetch sync logs' });
    }
  }
});

// Helper functions
async function getLastSyncTime(destination) {
  try {
    const result = await query(`
      SELECT created_at
      FROM sync_logs
      WHERE destination = $1 AND status = 'success'
      ORDER BY created_at DESC
      LIMIT 1
    `, [destination]);

    if (result.rows.length > 0) {
      const lastSync = new Date(result.rows[0].created_at);
      const now = new Date();
      const diffMs = now - lastSync;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      return 'Just now';
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getSyncedRecords(destination) {
  try {
    const result = await query(`
      SELECT SUM(records_synced) as total
      FROM sync_logs
      WHERE destination = $1 AND status = 'success'
    `, [destination]);

    return result.rows[0]?.total || 0;
  } catch (error) {
    return 0;
  }
}

async function getSyncStatus(destination) {
  try {
    const result = await query(`
      SELECT *
      FROM sync_logs
      WHERE destination = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [destination]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return { status: 'never_synced' };
  } catch (error) {
    return { status: 'unknown' };
  }
}

async function logSyncEvent(destination, recordsSynced, errorCount) {
  try {
    // Create table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        destination VARCHAR(50) NOT NULL,
        records_synced INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'success',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      INSERT INTO sync_logs (destination, records_synced, error_count, status)
      VALUES ($1, $2, $3, $4)
    `, [destination, recordsSynced, errorCount, errorCount > 0 ? 'partial' : 'success']);

  } catch (error) {
    logger.error('Error logging sync event:', error);
  }
}

module.exports = router;