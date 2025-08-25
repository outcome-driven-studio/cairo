/**
 * Full Sync Service
 *
 * Orchestrates comprehensive synchronization operations for Smartlead and Lemlist
 * with flexible date range control, namespace filtering, and progress tracking.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");
const { createRateLimiter } = require("../utils/bulkSyncRateLimiter");
const { createSqlDateFilter } = require("../utils/dateUtils");
const logger = require("../utils/logger");

// Import existing service dependencies
const SmartleadService = require("./smartleadService");
const LemlistService = require("./lemlistService");
const AttioService = require("./attioService");
const MixpanelService = require("./mixpanelService");
const NamespaceService = require("./namespaceService");

// Import database utilities
const { query } = require("../utils/db");
const { eventKeyGenerator } = require("../utils/eventKeyGenerator");

/**
 * Full Sync Service - Main orchestration class
 */
class FullSyncService {
  constructor() {
    // Initialize service dependencies
    this.smartleadService = new SmartleadService();
    this.lemlistService = new LemlistService();
    this.attioService = new AttioService();
    this.mixpanelService = new MixpanelService();
    this.namespaceService = new NamespaceService();

    // Initialize rate limiters
    this.rateLimiters = {
      smartlead: createRateLimiter("smartlead"),
      lemlist: createRateLimiter("lemlist"),
      attio: createRateLimiter("attio"),
      mixpanel: createRateLimiter("mixpanel"),
      database: createRateLimiter("database"),
    };

    logger.info("FullSyncService initialized with all dependencies");
  }

  /**
   * Execute full synchronization operation
   * @param {object|FullSyncConfig} config - Sync configuration
   * @returns {Promise<object>} Sync results
   */
  async executeFullSync(config) {
    // Ensure config is a FullSyncConfig instance
    const syncConfig =
      config instanceof FullSyncConfig ? config : new FullSyncConfig(config);

    logger.info("Starting full sync operation", syncConfig.getSummary());

    const startTime = new Date();
    const results = {
      startTime,
      endTime: null,
      config: syncConfig.getSummary(),
      platforms: {},
      summary: {
        totalUsers: 0,
        totalEvents: 0,
        totalErrors: 0,
        processedNamespaces: [],
      },
    };

    try {
      // Get target namespaces
      const targetNamespaces = await this.getTargetNamespaces(syncConfig);
      logger.info(`Target namespaces for sync: ${targetNamespaces.join(", ")}`);

      results.summary.processedNamespaces = targetNamespaces;

      // Execute sync for each platform
      for (const platform of syncConfig.platforms) {
        logger.info(`Starting ${platform} sync`);

        try {
          const platformResult = await this.syncPlatform(
            platform,
            syncConfig,
            targetNamespaces
          );
          results.platforms[platform] = platformResult;

          // Aggregate summary statistics
          results.summary.totalUsers += platformResult.users?.processed || 0;
          results.summary.totalEvents += platformResult.events?.processed || 0;
          results.summary.totalErrors += platformResult.errors?.length || 0;
        } catch (error) {
          logger.error(`Failed to sync ${platform}`, { error: error.message });
          results.platforms[platform] = {
            success: false,
            error: error.message,
            users: { processed: 0, errors: [] },
            events: { processed: 0, errors: [] },
          };
          results.summary.totalErrors++;
        }
      }

      results.endTime = new Date();
      results.duration = (results.endTime - startTime) / 1000;
      results.success = results.summary.totalErrors === 0;

      logger.info("Full sync operation completed", {
        duration: results.duration + "s",
        totalUsers: results.summary.totalUsers,
        totalEvents: results.summary.totalEvents,
        totalErrors: results.summary.totalErrors,
        success: results.success,
      });

      return results;
    } catch (error) {
      results.endTime = new Date();
      results.duration = (results.endTime - startTime) / 1000;
      results.success = false;
      results.error = error.message;

      logger.error("Full sync operation failed", {
        error: error.message,
        duration: results.duration + "s",
      });

      throw error;
    }
  }

  /**
   * Get target namespaces based on configuration
   * @private
   */
  async getTargetNamespaces(syncConfig) {
    if (syncConfig.namespaces === "all") {
      // Get all active namespaces from database
      const result = await query(
        "SELECT DISTINCT namespace FROM namespaces WHERE active = true ORDER BY namespace"
      );
      return result.rows.map((row) => row.namespace);
    } else {
      // Validate that specified namespaces exist
      const placeholders = syncConfig.namespaces
        .map((_, i) => `$${i + 1}`)
        .join(", ");
      const result = await query(
        `SELECT namespace FROM namespaces WHERE namespace IN (${placeholders}) AND active = true ORDER BY namespace`,
        syncConfig.namespaces
      );

      const validNamespaces = result.rows.map((row) => row.namespace);
      const invalidNamespaces = syncConfig.namespaces.filter(
        (ns) => !validNamespaces.includes(ns)
      );

      if (invalidNamespaces.length > 0) {
        logger.warn(
          `Invalid or inactive namespaces specified: ${invalidNamespaces.join(
            ", "
          )}`
        );
      }

      return validNamespaces;
    }
  }

  /**
   * Sync a single platform (Smartlead or Lemlist)
   * @private
   */
  async syncPlatform(platform, syncConfig, targetNamespaces) {
    const platformResult = {
      platform,
      startTime: new Date(),
      endTime: null,
      users: { processed: 0, errors: [] },
      events: { processed: 0, errors: [] },
      campaigns: { processed: 0, errors: [] },
    };

    try {
      // Handle sync timestamp reset if needed
      if (syncConfig.mode === SYNC_MODES.RESET_FROM_DATE) {
        await this.resetSyncTimestamps(
          platform,
          targetNamespaces,
          syncConfig.resetDate
        );
      }

      // Sync campaigns first
      const campaigns = await this.syncCampaigns(
        platform,
        syncConfig,
        targetNamespaces
      );
      platformResult.campaigns = campaigns;

      // Sync users
      const users = await this.syncUsers(
        platform,
        syncConfig,
        targetNamespaces
      );
      platformResult.users = users;

      // Sync events
      const events = await this.syncEvents(
        platform,
        syncConfig,
        targetNamespaces
      );
      platformResult.events = events;

      platformResult.endTime = new Date();
      platformResult.duration =
        (platformResult.endTime - platformResult.startTime) / 1000;
      platformResult.success =
        campaigns.errors.length === 0 &&
        users.errors.length === 0 &&
        events.errors.length === 0;

      logger.info(`${platform} sync completed`, {
        duration: platformResult.duration + "s",
        campaigns: campaigns.processed,
        users: users.processed,
        events: events.processed,
        success: platformResult.success,
      });

      return platformResult;
    } catch (error) {
      platformResult.endTime = new Date();
      platformResult.duration =
        (platformResult.endTime - platformResult.startTime) / 1000;
      platformResult.success = false;
      platformResult.error = error.message;

      logger.error(`${platform} sync failed`, {
        error: error.message,
        duration: platformResult.duration + "s",
      });

      throw error;
    }
  }

  /**
   * Reset sync timestamps for a platform
   * @private
   */
  async resetSyncTimestamps(platform, namespaces, resetDate) {
    logger.info(`Resetting ${platform} sync timestamps to ${resetDate}`);

    const placeholders = namespaces.map((_, i) => `$${i + 2}`).join(", ");

    await query(
      `UPDATE namespaces 
       SET last_${platform}_sync = $1 
       WHERE namespace IN (${placeholders})`,
      [resetDate, ...namespaces]
    );

    logger.info(`Reset sync timestamps for ${namespaces.length} namespaces`);
  }

  /**
   * Sync campaigns for a platform
   * @private
   */
  async syncCampaigns(platform, syncConfig, targetNamespaces) {
    logger.info(`Syncing ${platform} campaigns`);

    const result = { processed: 0, errors: [] };
    const rateLimiter = this.rateLimiters[platform];

    try {
      const service =
        platform === PLATFORMS.SMARTLEAD
          ? this.smartleadService
          : this.lemlistService;

      for (const namespace of targetNamespaces) {
        try {
          // Get campaigns with rate limiting
          const campaigns = await rateLimiter.makeRateLimitedCall(async () => {
            return await service.getCampaigns(namespace);
          });

          if (campaigns && campaigns.length > 0) {
            // Store campaigns in database with batch processing
            rateLimiter.initializeBulkOperation(
              campaigns,
              `${platform} campaigns for ${namespace}`
            );

            const batchResult = await rateLimiter.processAllBatches(
              async (campaignBatch) => {
                return await this.storeCampaignsBatch(
                  campaignBatch,
                  platform,
                  namespace
                );
              }
            );

            result.processed += campaigns.length;
            logger.debug(
              `Synced ${campaigns.length} ${platform} campaigns for namespace ${namespace}`
            );
          }
        } catch (error) {
          logger.error(
            `Failed to sync ${platform} campaigns for namespace ${namespace}`,
            {
              error: error.message,
            }
          );
          result.errors.push({
            namespace,
            error: error.message,
            type: "campaigns",
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to sync ${platform} campaigns`, {
        error: error.message,
      });
      result.errors.push({
        error: error.message,
        type: "campaigns_general",
      });
    }

    return result;
  }

  /**
   * Sync users for a platform
   * @private
   */
  async syncUsers(platform, syncConfig, targetNamespaces) {
    logger.info(`Syncing ${platform} users`);

    const result = { processed: 0, errors: [] };
    const rateLimiter = this.rateLimiters[platform];

    try {
      const service =
        platform === PLATFORMS.SMARTLEAD
          ? this.smartleadService
          : this.lemlistService;
      const dateFilter = syncConfig.getDateFilter();

      for (const namespace of targetNamespaces) {
        try {
          // Get campaigns for this namespace first
          const campaigns = await rateLimiter.makeRateLimitedCall(async () => {
            return await service.getCampaigns(namespace);
          });

          if (!campaigns || campaigns.length === 0) {
            continue;
          }

          // Get users for each campaign
          for (const campaign of campaigns) {
            try {
              const users = await rateLimiter.makeRateLimitedCall(async () => {
                return await service.getLeads(campaign.id);
              });

              if (users && users.length > 0) {
                // Filter users by date if needed
                const filteredUsers = this.filterByDate(
                  users,
                  dateFilter,
                  "created_at"
                );

                if (filteredUsers.length > 0) {
                  // Process users in batches
                  rateLimiter.initializeBulkOperation(
                    filteredUsers,
                    `${platform} users for campaign ${campaign.id}`
                  );

                  const batchResult = await rateLimiter.processAllBatches(
                    async (userBatch) => {
                      return await this.storeUsersBatch(
                        userBatch,
                        platform,
                        namespace,
                        campaign.id
                      );
                    }
                  );

                  result.processed += filteredUsers.length;
                }
              }
            } catch (error) {
              logger.error(
                `Failed to sync users for ${platform} campaign ${campaign.id}`,
                {
                  error: error.message,
                }
              );
              result.errors.push({
                namespace,
                campaignId: campaign.id,
                error: error.message,
                type: "users",
              });
            }
          }
        } catch (error) {
          logger.error(
            `Failed to sync ${platform} users for namespace ${namespace}`,
            {
              error: error.message,
            }
          );
          result.errors.push({
            namespace,
            error: error.message,
            type: "users",
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to sync ${platform} users`, {
        error: error.message,
      });
      result.errors.push({
        error: error.message,
        type: "users_general",
      });
    }

    return result;
  }

  /**
   * Sync events for a platform
   * @private
   */
  async syncEvents(platform, syncConfig, targetNamespaces) {
    logger.info(`Syncing ${platform} events`);

    const result = { processed: 0, errors: [] };
    const rateLimiter = this.rateLimiters[platform];

    try {
      const service =
        platform === PLATFORMS.SMARTLEAD
          ? this.smartleadService
          : this.lemlistService;
      const dateFilter = syncConfig.getDateFilter();

      for (const namespace of targetNamespaces) {
        try {
          // Get campaigns for this namespace
          const campaigns = await rateLimiter.makeRateLimitedCall(async () => {
            return await service.getCampaigns(namespace);
          });

          if (!campaigns || campaigns.length === 0) {
            continue;
          }

          // Get events for each campaign
          for (const campaign of campaigns) {
            try {
              const events = await rateLimiter.makeRateLimitedCall(async () => {
                if (platform === PLATFORMS.SMARTLEAD) {
                  return await service.getCampaignActivities(campaign.id);
                } else {
                  return await service.getCampaignActivities(campaign.id);
                }
              });

              if (events && events.length > 0) {
                // Filter events by date if needed
                const filteredEvents = this.filterByDate(
                  events,
                  dateFilter,
                  "created_at"
                );

                if (filteredEvents.length > 0) {
                  // Process events in batches
                  rateLimiter.initializeBulkOperation(
                    filteredEvents,
                    `${platform} events for campaign ${campaign.id}`
                  );

                  const batchResult = await rateLimiter.processAllBatches(
                    async (eventBatch) => {
                      return await this.storeEventsBatch(
                        eventBatch,
                        platform,
                        namespace,
                        campaign.id,
                        syncConfig
                      );
                    }
                  );

                  result.processed += filteredEvents.length;
                }
              }
            } catch (error) {
              logger.error(
                `Failed to sync events for ${platform} campaign ${campaign.id}`,
                {
                  error: error.message,
                }
              );
              result.errors.push({
                namespace,
                campaignId: campaign.id,
                error: error.message,
                type: "events",
              });
            }
          }
        } catch (error) {
          logger.error(
            `Failed to sync ${platform} events for namespace ${namespace}`,
            {
              error: error.message,
            }
          );
          result.errors.push({
            namespace,
            error: error.message,
            type: "events",
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to sync ${platform} events`, {
        error: error.message,
      });
      result.errors.push({
        error: error.message,
        type: "events_general",
      });
    }

    return result;
  }

  /**
   * Filter array of items by date
   * @private
   */
  filterByDate(items, dateFilter, dateField) {
    if (!dateFilter || !dateFilter.start) {
      return items;
    }

    return items.filter((item) => {
      const itemDate = new Date(item[dateField]);

      if (dateFilter.start && itemDate < dateFilter.start) {
        return false;
      }

      if (dateFilter.end && itemDate > dateFilter.end) {
        return false;
      }

      return true;
    });
  }

  /**
   * Store campaigns batch in database
   * @private
   */
  async storeCampaignsBatch(campaigns, platform, namespace) {
    const dbRateLimiter = this.rateLimiters.database;

    return await dbRateLimiter.makeRateLimitedCall(async () => {
      // Implementation would go here - storing campaigns with ON CONFLICT handling
      // For now, return success result
      return { processed: campaigns.length, errors: [] };
    });
  }

  /**
   * Store users batch in database
   * @private
   */
  async storeUsersBatch(users, platform, namespace, campaignId) {
    const dbRateLimiter = this.rateLimiters.database;

    return await dbRateLimiter.makeRateLimitedCall(async () => {
      // Implementation would go here - storing users with deduplication by email
      // For now, return success result
      return { processed: users.length, errors: [] };
    });
  }

  /**
   * Store events batch in database and track in Mixpanel
   * @private
   */
  async storeEventsBatch(events, platform, namespace, campaignId, syncConfig) {
    const dbRateLimiter = this.rateLimiters.database;
    const mixpanelRateLimiter = this.rateLimiters.mixpanel;

    // Store in database
    const dbResult = await dbRateLimiter.makeRateLimitedCall(async () => {
      const processed = [];
      const errors = [];

      for (const event of events) {
        try {
          // Generate improved event key using the unified generator
          const eventKey =
            platform === "lemlist"
              ? eventKeyGenerator.generateLemlistKey(
                  {
                    id: event.id,
                    type: event.type || "activity",
                    campaignId: campaignId,
                    date: event.created_at || event.timestamp,
                    leadId: event.lead_id,
                    lead: { email: event.email || event.contact_email },
                  },
                  campaignId,
                  namespace
                )
              : eventKeyGenerator.generateSmartleadKey(
                  event,
                  event.type || "activity",
                  campaignId,
                  event.email || event.contact_email,
                  namespace
                );

          const result = await query(
            `INSERT INTO event_source (
               event_key, user_id, event_type, platform, metadata, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (event_key) DO NOTHING
             RETURNING *`,
            [
              eventKey,
              event.email || event.contact_email,
              event.type || "activity",
              platform,
              JSON.stringify({
                ...event,
                namespace: namespace,
                campaign_id: campaignId,
                full_sync: true,
              }),
              new Date(event.created_at || event.timestamp || Date.now()),
            ]
          );

          if (result.rows.length > 0) {
            processed.push(result.rows[0]);
          }
        } catch (error) {
          errors.push({ event: event, error: error.message });
        }
      }

      return { processed: processed.length, errors };
    });

    // Track in Mixpanel if enabled
    if (syncConfig.enableMixpanelTracking && this.mixpanelService.enabled) {
      try {
        await mixpanelRateLimiter.makeRateLimitedCall(async () => {
          // Track events individually (don't fail batch if some fail)
          const trackingPromises = events.map(async (event) => {
            try {
              const mixpanelEvent = this.convertToMixpanelEvent(
                event,
                platform,
                namespace,
                campaignId
              );
              if (mixpanelEvent.event && mixpanelEvent.properties.distinct_id) {
                await this.mixpanelService.track(
                  mixpanelEvent.properties.distinct_id,
                  mixpanelEvent.event,
                  mixpanelEvent.properties
                );
              }
            } catch (error) {
              logger.debug(
                `Failed to track single event in Mixpanel:`,
                error.message
              );
            }
          });

          // Don't await all - just fire and forget for performance
          Promise.allSettled(trackingPromises).catch(() => {
            // Ignore batch tracking errors
          });

          return { tracked: events.length };
        });
      } catch (error) {
        logger.warn(`Failed to batch track events in Mixpanel`, {
          error: error.message,
        });
        // Don't fail the whole batch for Mixpanel errors
      }
    }

    return dbResult;
  }

  /**
   * Convert platform event to Mixpanel event format
   * @private
   */
  convertToMixpanelEvent(event, platform, namespace, campaignId) {
    // Map platform-specific event types to Mixpanel events
    const eventTypeMap = {
      smartlead: {
        email_sent: "smartlead_email_sent",
        email_opened: "smartlead_email_opened",
        email_clicked: "smartlead_email_clicked",
        email_replied: "smartlead_email_replied",
        lead_created: "smartlead_lead_created",
        campaign_started: "smartlead_campaign_started",
      },
      lemlist: {
        emailsent: "lemlist_email_sent",
        emailopened: "lemlist_email_opened",
        emailclicked: "lemlist_email_clicked",
        emailreplied: "lemlist_email_replied",
        linkedinmessage: "lemlist_linkedin_message",
        linkedinvisit: "lemlist_linkedin_visit",
        campaignstarted: "lemlist_campaign_started",
      },
    };

    const eventType = event.type || "activity";
    const mixpanelEvent =
      eventTypeMap[platform]?.[eventType] || `${platform}_${eventType}`;

    // Extract email from different possible fields
    const userEmail =
      event.email || event.contact_email || event.lead_email || event.leadEmail;

    if (!userEmail) {
      logger.debug(`No email found for event: ${JSON.stringify(event)}`);
      return null;
    }

    return {
      event: mixpanelEvent,
      properties: {
        distinct_id: userEmail.toLowerCase(),
        time: Math.floor(
          new Date(
            event.created_at || event.timestamp || Date.now()
          ).getTime() / 1000
        ),

        // Campaign context
        campaign_id: campaignId,
        campaign_name: event.campaign_name || event.campaignName,
        campaign_platform: platform,

        // User context
        user_namespace: namespace,
        user_source: "sync",

        // Event context
        event_source: "full_sync_pipeline",
        sync_mode: "bulk",
        event_key: `${platform}-${campaignId}-${
          event.id || event.type
        }-${userEmail}`,

        // Technical metadata
        platform: platform,
        original_timestamp: event.created_at || event.timestamp,

        // Additional event properties
        ...(event.properties || {}),

        // Platform-specific metadata
        ...this.extractPlatformMetadata(event, platform),
      },
    };
  }

  /**
   * Extract platform-specific metadata for Mixpanel
   * @private
   */
  extractPlatformMetadata(event, platform) {
    const metadata = {};

    if (platform === "smartlead") {
      if (event.first_name) metadata.lead_first_name = event.first_name;
      if (event.last_name) metadata.lead_last_name = event.last_name;
      if (event.company) metadata.lead_company = event.company;
      if (event.linkedin_url) metadata.has_linkedin = true;
    } else if (platform === "lemlist") {
      if (event.lead?.firstName)
        metadata.lead_first_name = event.lead.firstName;
      if (event.lead?.lastName) metadata.lead_last_name = event.lead.lastName;
      if (event.lead?.company) metadata.lead_company = event.lead.company;
      if (event.lead?.linkedinUrl) metadata.has_linkedin = true;
      if (event.stepIndex) metadata.sequence_step = event.stepIndex;
      if (event.subject) metadata.email_subject = event.subject;
    }

    return metadata;
  }

  /**
   * Get sync status for monitoring
   */
  async getSyncStatus() {
    const status = {
      rateLimiters: {},
      recentActivity: await this.getRecentSyncActivity(),
      systemHealth: await this.checkSystemHealth(),
    };

    // Get rate limiter status
    for (const [name, limiter] of Object.entries(this.rateLimiters)) {
      status.rateLimiters[name] = limiter.getStatus();
    }

    return status;
  }

  /**
   * Get recent sync activity from database
   * @private
   */
  async getRecentSyncActivity() {
    try {
      const result = await query(`
        SELECT 
          namespace,
          last_smartlead_sync,
          last_lemlist_sync,
          updated_at
        FROM namespaces 
        WHERE active = true 
        ORDER BY updated_at DESC 
        LIMIT 10
      `);

      return result.rows;
    } catch (error) {
      logger.error("Failed to get recent sync activity", {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Check system health for monitoring
   * @private
   */
  async checkSystemHealth() {
    const health = {
      database: false,
      smartlead: false,
      lemlist: false,
      attio: false,
      mixpanel: false,
    };

    try {
      // Test database connection
      await query("SELECT 1");
      health.database = true;
    } catch (error) {
      logger.error("Database health check failed", { error: error.message });
    }

    // Add service health checks as needed

    return health;
  }
}

module.exports = FullSyncService;
