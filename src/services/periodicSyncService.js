const cron = require("node-cron");
const logger = require("../utils/logger");
const syncState = require("../utils/syncState");
const { query } = require("../utils/db");
const AttioService = require("./attioService");
const LemlistService = require("./lemlistService");
const SmartleadService = require("./smartleadService");
const LeadScoringService = require("./leadScoringService");
const monitoring = require("../utils/monitoring");

class PeriodicSyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = process.env.SYNC_INTERVAL_HOURS || 4; // Default 4 hours
    this.cronJobs = [];
    this.lastSyncTimes = {};

    // Initialize services
    this.attioService = new AttioService(process.env.ATTIO_API_KEY);
    this.lemlistService = process.env.LEMLIST_API_KEY
      ? new LemlistService(process.env.LEMLIST_API_KEY)
      : null;
    this.smartleadService = process.env.SMARTLEAD_API_KEY
      ? new SmartleadService(process.env.SMARTLEAD_API_KEY)
      : null;
    this.leadScoringService = new LeadScoringService();

    // Track statistics
    this.stats = {
      totalSyncs: 0,
      lastSyncTime: null,
      errors: [],
      syncHistory: [],
    };
  }

  /**
   * Start the periodic sync jobs
   */
  async start() {
    if (this.isRunning) {
      logger.warn("[PeriodicSync] Already running, skipping start");
      return;
    }

    logger.info(
      `[PeriodicSync] Starting periodic sync every ${this.syncInterval} hours`
    );

    // Initialize sync state table
    await syncState.init();

    // Schedule cron job (every N hours)
    const cronExpression = `0 */${this.syncInterval} * * *`;

    const job = cron.schedule(cronExpression, async () => {
      await this.runFullSync();
    });

    this.cronJobs.push(job);
    this.isRunning = true;

    // Run initial sync if configured
    if (process.env.RUN_SYNC_ON_START === "true") {
      logger.info("[PeriodicSync] Running initial sync on startup");
      await this.runFullSync();
    }

    logger.info(`[PeriodicSync] Scheduled sync job: ${cronExpression}`);
  }

  /**
   * Stop all periodic sync jobs
   */
  stop() {
    logger.info("[PeriodicSync] Stopping all periodic sync jobs");
    this.cronJobs.forEach((job) => job.stop());
    this.cronJobs = [];
    this.isRunning = false;
  }

  /**
   * Run complete sync pipeline
   */
  async runFullSync() {
    const startTime = Date.now();
    const syncId = `sync_${startTime}`;

    logger.info(`[PeriodicSync] Starting full sync run: ${syncId}`);
    monitoring.trackSyncStart("periodic", "full");

    const results = {
      attio: { success: false, imported: 0, error: null },
      lemlist: { success: false, events: 0, users: 0, error: null },
      smartlead: { success: false, events: 0, users: 0, error: null },
      scoring: { success: false, scored: 0, error: null },
      duration: 0,
    };

    try {
      // Step 1: Import new leads from Attio
      if (process.env.SYNC_FROM_ATTIO !== "false") {
        results.attio = await this.syncFromAttio();
      }

      // Step 2: Sync Lemlist data (delta sync based on last sync time)
      if (this.lemlistService && process.env.SYNC_FROM_LEMLIST !== "false") {
        results.lemlist = await this.syncFromLemlist();
      }

      // Step 3: Sync Smartlead data (delta sync based on last sync time)
      if (
        this.smartleadService &&
        process.env.SYNC_FROM_SMARTLEAD !== "false"
      ) {
        results.smartlead = await this.syncFromSmartlead();
      }

      // Step 4: Calculate behavior scores for engagement tracking
      // This runs frequently (every 4 hours) so we only update behavior scores
      if (process.env.CALCULATE_SCORES !== "false") {
        results.scoring = await this.calculateBehaviorScores();
      }

      // Step 5: Sync scores back to Attio
      if (process.env.SYNC_SCORES_TO_ATTIO !== "false") {
        await this.syncScoresToAttio();
      }

      results.duration = (Date.now() - startTime) / 1000; // in seconds

      // Update statistics
      this.stats.totalSyncs++;
      this.stats.lastSyncTime = new Date();
      this.stats.syncHistory.push({
        id: syncId,
        timestamp: this.stats.lastSyncTime,
        results,
        success: true,
      });

      // Keep only last 100 sync records
      if (this.stats.syncHistory.length > 100) {
        this.stats.syncHistory = this.stats.syncHistory.slice(-100);
      }

      monitoring.trackSyncSuccess("periodic", "full", results);
      logger.info(
        `[PeriodicSync] Full sync completed in ${results.duration}s`,
        results
      );

      return results;
    } catch (error) {
      logger.error("[PeriodicSync] Full sync failed:", error);
      monitoring.trackSyncFailure("periodic", "full", error);

      this.stats.errors.push({
        timestamp: new Date(),
        error: error.message,
        stack: error.stack,
      });

      // Keep only last 50 errors
      if (this.stats.errors.length > 50) {
        this.stats.errors = this.stats.errors.slice(-50);
      }

      throw error;
    }
  }

  /**
   * Import new leads from Attio (manually added)
   */
  async syncFromAttio() {
    logger.info("[PeriodicSync] Checking for new Attio leads...");

    try {
      // Get last Attio sync time
      const lastSync = await syncState.getLastChecked("attio_import");
      const lastSyncTime =
        lastSync || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

      logger.info(
        `[PeriodicSync] Last Attio import: ${lastSyncTime.toISOString()}`
      );

      // Fetch all people from Attio
      let allPeople = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const response = await this.attioService.listPeople(limit, offset);
        if (!response?.data?.length) break;

        allPeople = allPeople.concat(response.data);
        offset += limit;

        if (response.data.length < limit) break;
      }

      logger.info(
        `[PeriodicSync] Fetched ${allPeople.length} people from Attio`
      );

      // Filter for new people (created after last sync)
      const newPeople = allPeople.filter((person) => {
        const createdAt = new Date(person.created_at);
        return createdAt > lastSyncTime;
      });

      logger.info(
        `[PeriodicSync] Found ${newPeople.length} new people since last sync`
      );

      // Add new people to database
      let imported = 0;
      for (const person of newPeople) {
        try {
          const email = person.values.email?.[0]?.email_address;
          if (!email) continue;

          // Check if user already exists
          const existing = await query(
            `SELECT id FROM playmaker_user_source WHERE email = $1`,
            [email]
          );

          if (existing.rows.length === 0) {
            // Insert new user
            await query(
              `INSERT INTO playmaker_user_source 
               (email, name, created_at, updated_at, original_user_id, platform)
               VALUES ($1, $2, NOW(), NOW(), $3, $4)
               ON CONFLICT (email) DO NOTHING`,
              [
                email,
                person.values.name || email.split("@")[0],
                person.id.record_id,
                "attio",
              ]
            );
            imported++;
            logger.debug(`[PeriodicSync] Imported new lead: ${email}`);
          }
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to import person: ${error.message}`
          );
        }
      }

      // Update last sync time
      await syncState.setLastChecked("attio_import");

      return { success: true, imported, total: allPeople.length };
    } catch (error) {
      logger.error("[PeriodicSync] Attio import failed:", error);
      return { success: false, imported: 0, error: error.message };
    }
  }

  /**
   * Sync data from Lemlist (delta sync)
   */
  async syncFromLemlist() {
    logger.info("[PeriodicSync] Starting Lemlist delta sync...");

    try {
      // Get last sync time
      const lastSync = await syncState.getLastChecked("lemlist");
      const lastSyncTime =
        lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

      logger.info(
        `[PeriodicSync] Last Lemlist sync: ${lastSyncTime.toISOString()}`
      );

      let totalEvents = 0;
      let totalUsers = 0;

      // Get all campaigns
      const campaigns = await this.lemlistService.getCampaigns();

      for (const campaign of campaigns) {
        try {
          // Get activities since last sync
          const activities = await this.lemlistService.getActivities(
            campaign.id,
            100,
            0,
            { startDate: lastSyncTime.toISOString() }
          );

          for (const activity of activities) {
            // Insert event
            await query(
              `INSERT INTO event_source 
               (event_key, event_type, platform, user_id, metadata, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (event_key) DO NOTHING`,
              [
                `lemlist-${activity.type}-${activity.id}`,
                activity.type,
                "lemlist",
                activity.leadEmail || activity.leadId,
                JSON.stringify(activity),
                activity.createdAt || new Date(),
              ]
            );
            totalEvents++;
          }

          // Also sync campaign leads (users)
          const leads = await this.lemlistService.getCampaignLeads(campaign.id);
          for (const lead of leads) {
            if (!lead.email) continue;

            await query(
              `INSERT INTO playmaker_user_source 
               (email, name, created_at, updated_at, original_user_id, platform)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (email) DO UPDATE SET
                 name = COALESCE(EXCLUDED.name, playmaker_user_source.name),
                 updated_at = NOW()`,
              [
                lead.email,
                lead.firstName && lead.lastName
                  ? `${lead.firstName} ${lead.lastName}`
                  : lead.email.split("@")[0],
                lead.createdAt || new Date(),
                new Date(),
                lead.id,
                "lemlist",
              ]
            );
            totalUsers++;
          }
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to sync Lemlist campaign ${campaign.id}:`,
            error
          );
        }
      }

      // Update last sync time
      await syncState.setLastChecked("lemlist");

      return { success: true, events: totalEvents, users: totalUsers };
    } catch (error) {
      logger.error("[PeriodicSync] Lemlist sync failed:", error);
      return { success: false, events: 0, users: 0, error: error.message };
    }
  }

  /**
   * Sync data from Smartlead (delta sync)
   */
  async syncFromSmartlead() {
    logger.info("[PeriodicSync] Starting Smartlead delta sync...");

    try {
      // Get last sync time
      const lastSync = await syncState.getLastChecked("smartlead");
      const lastSyncTime =
        lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

      logger.info(
        `[PeriodicSync] Last Smartlead sync: ${lastSyncTime.toISOString()}`
      );

      let totalEvents = 0;
      let totalUsers = 0;

      // Get all campaigns
      const campaigns = await this.smartleadService.getCampaigns();

      for (const campaign of campaigns) {
        try {
          // Get leads
          const leads = await this.smartleadService.getLeadsByCampaign(
            campaign.id
          );

          for (const lead of leads) {
            if (!lead.email) continue;

            // Insert/update user
            await query(
              `INSERT INTO playmaker_user_source 
               (email, name, created_at, updated_at, original_user_id, platform)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (email) DO UPDATE SET
                 name = COALESCE(EXCLUDED.name, playmaker_user_source.name),
                 updated_at = NOW()`,
              [
                lead.email,
                lead.first_name && lead.last_name
                  ? `${lead.first_name} ${lead.last_name}`
                  : lead.email.split("@")[0],
                lead.created_at || new Date(),
                new Date(),
                lead.id,
                "smartlead",
              ]
            );
            totalUsers++;

            // Get email stats for events
            const stats = await this.smartleadService.getEmailStats(
              campaign.id,
              lead.email
            );

            // Process each event type
            const eventTypes = ["sent", "opened", "clicked", "replied"];
            for (const eventType of eventTypes) {
              if (stats[eventType] && stats[eventType] > 0) {
                const eventKey = `smartlead-${eventType}-${campaign.id}-${lead.email}`;

                await query(
                  `INSERT INTO event_source 
                   (event_key, event_type, platform, user_id, metadata, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (event_key) DO NOTHING`,
                  [
                    eventKey,
                    `email_${eventType}`,
                    "smartlead",
                    lead.email,
                    JSON.stringify({ campaign_id: campaign.id, ...stats }),
                    new Date(),
                  ]
                );
                totalEvents++;
              }
            }
          }
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to sync Smartlead campaign ${campaign.id}:`,
            error
          );
        }
      }

      // Update last sync time
      await syncState.setLastChecked("smartlead");

      return { success: true, events: totalEvents, users: totalUsers };
    } catch (error) {
      logger.error("[PeriodicSync] Smartlead sync failed:", error);
      return { success: false, events: 0, users: 0, error: error.message };
    }
  }

  /**
   * Calculate ONLY behavior scores for users (no ICP/enrichment)
   * Used in 4-hour periodic sync to track engagement
   */
  async calculateBehaviorScores() {
    logger.info("[PeriodicSync] Calculating behavior scores only...");

    try {
      // Get all users with events to score for behavior
      // We want to update behavior scores frequently for all users with activity
      const users = await query(
        `SELECT DISTINCT u.* 
         FROM playmaker_user_source u
         WHERE EXISTS (
           SELECT 1 FROM event_source e 
           WHERE e.user_id = u.original_user_id::text 
           OR e.user_id = u.email
         )
         LIMIT 1000` // Process in larger batches since no API calls
      );

      logger.info(
        `[PeriodicSync] Found ${users.rows.length} users to update behavior scores`
      );

      let scored = 0;
      for (const user of users.rows) {
        try {
          await this.leadScoringService.scoreBehaviorOnly(user);
          scored++;
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to score behavior for user ${user.email}:`,
            error
          );
        }
      }

      return { success: true, scored, type: "behavior" };
    } catch (error) {
      logger.error("[PeriodicSync] Behavior scoring failed:", error);
      return { success: false, scored: 0, error: error.message };
    }
  }

  /**
   * Calculate ICP scores for users without ICP scores (weekly job)
   * Uses EnrichmentService with AI fallback for cost optimization
   */
  async calculateICPScores() {
    logger.info("[PeriodicSync] Calculating ICP scores for unscored users...");

    try {
      // Get users with no ICP score or very old ICP score
      const staleThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

      const users = await query(
        `SELECT * FROM playmaker_user_source 
         WHERE (icp_score IS NULL OR icp_score = 0)
         OR (apollo_enriched_at IS NULL OR apollo_enriched_at < $1)
         LIMIT 100`, // Smaller batch due to API calls
        [staleThreshold]
      );

      logger.info(
        `[PeriodicSync] Found ${users.rows.length} users needing ICP scoring`
      );

      // Use EnrichmentService instead of direct Apollo (includes AI fallback)
      const EnrichmentService = require("./enrichmentService");
      const enrichmentService = new EnrichmentService();

      let scored = 0;
      let totalCost = 0;

      for (const user of users.rows) {
        try {
          // First check if user already has an ICP score to avoid resetting it
          if (user.icp_score && user.icp_score > 0) {
            logger.debug(
              `[PeriodicSync] User ${user.email} already has ICP score ${user.icp_score}, skipping`
            );
            continue;
          }

          // Enrich user data using cost-optimized strategy
          const enrichResult = await enrichmentService.enrichUser(user, {
            updateDb: true,
            strategy: "cost_optimized", // AI first, then Hunter, then Apollo
          });

          if (enrichResult.success) {
            // Now calculate ICP score based on enriched data
            await this.leadScoringService.scoreICPOnly(user, null); // No Apollo service needed, data already enriched
            scored++;
            totalCost += enrichResult.cost || 0;

            logger.info(
              `[PeriodicSync] ICP scored ${user.email} via ${enrichResult.source} (cost: $${enrichResult.cost})`
            );
          } else {
            logger.warn(
              `[PeriodicSync] Failed to enrich ${user.email} for ICP scoring`
            );
          }
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to score ICP for user ${user.email}:`,
            error
          );
        }
      }

      logger.info(
        `[PeriodicSync] ICP scoring completed: ${scored} users scored, total cost: $${totalCost.toFixed(
          2
        )}`
      );

      return {
        success: true,
        scored,
        type: "icp",
        totalCost,
        stats: enrichmentService.getStats(),
      };
    } catch (error) {
      logger.error("[PeriodicSync] ICP scoring failed:", error);
      return { success: false, scored: 0, error: error.message };
    }
  }

  /**
   * Calculate lead scores for users needing scoring (DEPRECATED - use specific methods)
   */
  async calculateScores() {
    logger.warn(
      "[PeriodicSync] Using deprecated calculateScores - consider using calculateBehaviorScores or calculateICPScores"
    );

    try {
      // Get users that need scoring (no score or stale score)
      const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

      const users = await query(
        `SELECT * FROM playmaker_user_source 
         WHERE (last_scored_at IS NULL OR last_scored_at < $1)
         OR (icp_score IS NULL OR icp_score = 0)
         LIMIT 500`, // Process in batches
        [staleThreshold]
      );

      logger.info(
        `[PeriodicSync] Found ${users.rows.length} users needing scoring`
      );

      let scored = 0;
      for (const user of users.rows) {
        try {
          await this.leadScoringService.scoreUser(user);
          scored++;
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to score user ${user.email}:`,
            error
          );
        }
      }

      return { success: true, scored };
    } catch (error) {
      logger.error("[PeriodicSync] Scoring failed:", error);
      return { success: false, scored: 0, error: error.message };
    }
  }

  /**
   * Sync scores to Attio - ONLY for engaged users (behavior_score > 0)
   */
  async syncScoresToAttio() {
    logger.info(
      "[PeriodicSync] Syncing engaged users to Attio (behavior_score > 0)..."
    );

    try {
      // Get minimum behavior score threshold (default: 1, meaning > 0)
      const minBehaviorScore = parseInt(
        process.env.MIN_BEHAVIOR_SCORE_FOR_ATTIO || "1"
      );

      // Get users with scores that haven't been synced recently
      const lastSync = await syncState.getLastChecked("attio_score_sync");
      const lastSyncTime = lastSync || new Date(0);

      // IMPORTANT: Only sync users with behavior_score > 0 (engaged users)
      const users = await query(
        `SELECT * FROM playmaker_user_source 
         WHERE last_scored_at > $1 
         AND lead_score IS NOT NULL
         AND behaviour_score >= $2
         ORDER BY behaviour_score DESC
         LIMIT 100`,
        [lastSyncTime, minBehaviorScore]
      );

      logger.info(
        `[PeriodicSync] Found ${users.rows.length} engaged users to sync to Attio`
      );

      let synced = 0;
      let skipped = 0;

      for (const user of users.rows) {
        try {
          // Double-check behavior score before syncing
          if (user.behaviour_score < minBehaviorScore) {
            logger.debug(
              `[PeriodicSync] Skipping ${user.email} - behavior score ${user.behaviour_score} < ${minBehaviorScore}`
            );
            skipped++;
            continue;
          }

          await this.attioService.upsertPersonWithScores(
            user.email,
            user.name,
            user.icp_score,
            user.behaviour_score,
            user.lead_score,
            user.lead_grade
          );
          synced++;
        } catch (error) {
          logger.error(
            `[PeriodicSync] Failed to sync ${user.email} to Attio:`,
            error
          );
        }
      }

      // Update last sync time
      await syncState.setLastChecked("attio_score_sync");

      logger.info(
        `[PeriodicSync] Synced ${synced} engaged users to Attio (skipped ${skipped} unengaged)`
      );

      return { success: true, synced, skipped };
    } catch (error) {
      logger.error("[PeriodicSync] Attio sync failed:", error);
      return { success: false, synced: 0, error: error.message };
    }
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      syncInterval: this.syncInterval,
      nextSyncTime: this.getNextSyncTime(),
    };
  }

  /**
   * Get next sync time
   */
  getNextSyncTime() {
    if (!this.stats.lastSyncTime) {
      return new Date(Date.now() + this.syncInterval * 60 * 60 * 1000);
    }
    return new Date(
      this.stats.lastSyncTime.getTime() + this.syncInterval * 60 * 60 * 1000
    );
  }

  /**
   * Force run sync (manual trigger)
   */
  async forceSync() {
    logger.info("[PeriodicSync] Manual sync triggered");
    return await this.runFullSync();
  }
}

// Singleton instance
let instance;

function getInstance() {
  if (!instance) {
    instance = new PeriodicSyncService();
  }
  return instance;
}

module.exports = {
  PeriodicSyncService,
  getInstance,
};
