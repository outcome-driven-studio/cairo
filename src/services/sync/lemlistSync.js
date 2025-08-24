const { query } = require("../../utils/db");
const logger = require("../../utils/logger");
const LemlistService = require("../lemlistService");
const NamespaceService = require("../namespaceService");
const TableManagerService = require("../tableManagerService");
const MixpanelService = require("../mixpanelService");
const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");

class LemlistSync {
  constructor(options = {}) {
    this.lemlistService = new LemlistService(process.env.LEMLIST_API_KEY);
    this.namespaceService = new NamespaceService();
    this.tableManager = new TableManagerService();
    this.mixpanelService = new MixpanelService(
      process.env.MIXPANEL_PROJECT_TOKEN
    );

    // Mixpanel tracking configuration
    this.trackingConfig = {
      enableMixpanelTracking: options.enableMixpanelTracking !== false, // Default true
      trackCampaignEvents: options.trackCampaignEvents !== false, // Default true
      trackUserEvents: options.trackUserEvents !== false, // Default true
      ...options.trackingConfig,
    };

    logger.info("LemlistSync initialized with Mixpanel tracking", {
      mixpanelEnabled: this.mixpanelService.enabled,
      trackingConfig: this.trackingConfig,
    });
  }

  async upsertUserSource(userData, campaignName = null) {
    if (!userData.email) return null;
    const email = userData.email.trim().toLowerCase();

    try {
      // Detect namespace from campaign name
      const namespace = campaignName
        ? await this.namespaceService.detectNamespaceFromCampaign(campaignName)
        : "playmaker";

      // Ensure namespace table exists
      const tableName = await this.tableManager.ensureNamespaceTableExists(
        namespace
      );

      // Upsert user into namespace-specific table
      const result = await query(
        `INSERT INTO ${tableName} (
           email, name, first_name, last_name, company, 
           linkedin_profile, platform, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, ${tableName}.name),
           first_name = COALESCE(EXCLUDED.first_name, ${tableName}.first_name),
           last_name = COALESCE(EXCLUDED.last_name, ${tableName}.last_name),
           company = COALESCE(EXCLUDED.company, ${tableName}.company),
           linkedin_profile = COALESCE(EXCLUDED.linkedin_profile, ${tableName}.linkedin_profile),
           platform = EXCLUDED.platform,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          email,
          userData.name,
          userData.first_name,
          userData.last_name,
          userData.company,
          userData.linkedin_profile,
          userData.platform || "lemlist",
          userData.created_at || new Date(),
          new Date(),
        ]
      );

      logger.info(
        `✅ [${namespace}] Upserted user: ${email} in table: ${tableName}`
      );
      return {
        ...result.rows[0],
        namespace: namespace,
        table_name: tableName,
      };
    } catch (error) {
      logger.error(`❌ Failed to upsert user for: ${email}`, error);
      return null;
    }
  }

  async insertEventSource(eventData, namespace = "playmaker") {
    if (!eventData.email || !eventData.event_key) return null;

    try {
      // Add namespace info to event metadata
      const enhancedMetadata = {
        ...eventData.metadata,
        namespace: namespace,
      };

      const result = await query(
        `INSERT INTO event_source (
           event_key, user_id, event_type, platform, metadata, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING *`,
        [
          eventData.event_key,
          eventData.email.toLowerCase(),
          eventData.event_type,
          eventData.platform || "lemlist",
          JSON.stringify(enhancedMetadata),
          eventData.timestamp || new Date(),
        ]
      );

      if (result.rows.length > 0) {
        logger.info(
          `✅ [${namespace}] Created new event: ${eventData.event_key}`
        );

        // Track event in Mixpanel (non-blocking)
        await this.trackEventInMixpanel(eventData, namespace);

        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error(`❌ Failed to create event for: ${eventData.email}`, error);
      return null;
    }
  }

  /**
   * Track event in Mixpanel with campaign context
   * @param {Object} eventData - Event data from database
   * @param {string} namespace - Namespace for the event
   * @private
   */
  async trackEventInMixpanel(eventData, namespace) {
    if (
      !this.trackingConfig.enableMixpanelTracking ||
      !this.mixpanelService.enabled
    ) {
      return;
    }

    try {
      // Map database event types to Mixpanel events
      const mixpanelEvent = this.mapToMixpanelEvent(eventData.event_type);
      if (!mixpanelEvent) return;

      // Prepare Mixpanel properties
      const mixpanelProperties = {
        // Campaign context
        campaign_id: eventData.metadata?.campaign_id,
        campaign_name: eventData.metadata?.campaign_name,
        campaign_platform: "lemlist",

        // User context
        user_namespace: namespace,
        user_source: "sync",

        // Event context
        event_source: "sync_pipeline",
        event_key: eventData.event_key,
        sync_mode: "periodic",

        // Technical metadata
        platform: eventData.platform,
        original_timestamp: eventData.timestamp || new Date(),

        // Additional metadata from event
        ...this.extractMixpanelMetadata(eventData.metadata),
      };

      // Track asynchronously (don't await to avoid slowing down sync)
      this.mixpanelService
        .track(eventData.email.toLowerCase(), mixpanelEvent, mixpanelProperties)
        .catch((error) => {
          logger.warn(
            `[LemlistSync] Mixpanel tracking failed for ${eventData.event_key}:`,
            error.message
          );
        });

      logger.debug(
        `[LemlistSync] Queued Mixpanel event: ${mixpanelEvent} for ${eventData.email}`
      );
    } catch (error) {
      logger.warn(
        `[LemlistSync] Error preparing Mixpanel event:`,
        error.message
      );
    }
  }

  /**
   * Map database event types to Mixpanel event names
   * @param {string} eventType - Database event type
   * @returns {string|null} Mixpanel event name
   * @private
   */
  mapToMixpanelEvent(eventType) {
    const eventMap = {
      emailsent: "lemlist_email_sent",
      emailopened: "lemlist_email_opened",
      emailclicked: "lemlist_email_clicked",
      emailreplied: "lemlist_email_replied",
      linkedinvisit: "lemlist_linkedin_visit",
      linkedinmessage: "lemlist_linkedin_message",
      linkedinconnect: "lemlist_linkedin_connect",
      emailbounced: "lemlist_email_bounced",
      emailunsubscribed: "lemlist_email_unsubscribed",
      campaignstarted: "lemlist_campaign_started",
      lead_created: "lemlist_lead_created",
    };

    return eventMap[eventType] || null;
  }

  /**
   * Extract relevant metadata for Mixpanel properties
   * @param {Object} metadata - Event metadata
   * @returns {Object} Cleaned metadata for Mixpanel
   * @private
   */
  extractMixpanelMetadata(metadata = {}) {
    const cleanMetadata = {};

    // Extract useful fields for analytics
    if (metadata.activity?.lead?.company)
      cleanMetadata.lead_company = metadata.activity.lead.company;
    if (metadata.activity?.lead?.firstName)
      cleanMetadata.lead_first_name = metadata.activity.lead.firstName;
    if (metadata.activity?.lead?.lastName)
      cleanMetadata.lead_last_name = metadata.activity.lead.lastName;
    if (metadata.activity?.lead?.linkedinUrl) cleanMetadata.has_linkedin = true;
    if (metadata.activity?.stepIndex)
      cleanMetadata.sequence_step = metadata.activity.stepIndex;
    if (metadata.activity?.subject)
      cleanMetadata.email_subject = metadata.activity.subject;
    if (metadata.activity?.type)
      cleanMetadata.activity_type = metadata.activity.type;

    return cleanMetadata;
  }

  /**
   * Get the last sync timestamp for Lemlist
   * @returns {Promise<string>} Last sync timestamp
   */
  async getLastSyncTimestamp() {
    const result = await query(
      `SELECT created_at 
       FROM event_source 
       WHERE platform = 'lemlist' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    return result.rows[0]?.created_at;
  }

  /**
   * Run delta sync for Lemlist
   */
  async run() {
    logger.info("Starting Lemlist delta sync...");

    try {
      const lastSync = await this.getLastSyncTimestamp();
      logger.info(`Last sync timestamp: ${lastSync || "None (first sync)"}`);

      const campaigns = await this.lemlistService.getCampaigns();
      let totalActivities = 0;
      let newActivities = 0;

      for (const campaign of campaigns) {
        logger.info(
          `[Lemlist] Processing campaign: ${campaign.name} (ID: ${campaign._id})`
        );

        const activities = await this.lemlistService.getCampaignActivities(
          campaign._id
        );

        // Detect namespace for this campaign
        const namespace =
          await this.namespaceService.detectNamespaceFromCampaign(
            campaign.name
          );

        for (const activity of activities) {
          totalActivities++;

          // Skip if activity is older than last sync
          if (
            lastSync &&
            activity.date &&
            new Date(activity.date) <= new Date(lastSync)
          ) {
            continue;
          }

          if (!activity.lead?.email) continue;

          // Prepare user data
          const userData = {
            email: activity.lead.email,
            name: activity.lead.firstName
              ? `${activity.lead.firstName} ${
                  activity.lead.lastName || ""
                }`.trim()
              : activity.lead.name || null,
            first_name: activity.lead.firstName || null,
            last_name: activity.lead.lastName || null,
            company: activity.lead.company,
            linkedin_profile: activity.lead.linkedinUrl,
            platform: "lemlist",
            created_at: activity.date || new Date(),
          };

          // Upsert user to namespace-specific table
          const userResult = await this.upsertUserSource(
            userData,
            campaign.name
          );

          if (userResult) {
            // Insert event with namespace context using improved event key generation
            const eventKey = eventKeyGenerator.generateLemlistKey(
              activity,
              activity.campaignId,
              namespace
            );

            await this.insertEventSource(
              {
                email: activity.lead.email,
                event_key: eventKey,
                event_type: activity.type,
                platform: "lemlist",
                timestamp: activity.date,
                metadata: {
                  campaign_id: activity.campaignId,
                  campaign_name: campaign.name,
                  activity: activity,
                  namespace: namespace,
                },
              },
              namespace
            );
          }

          newActivities++;
        }

        logger.info(
          `[Lemlist] Completed campaign ${campaign.name} with namespace: ${namespace}`
        );
      }

      logger.info(
        `✅ Lemlist delta sync completed: ${newActivities} new activities out of ${totalActivities} total`
      );
    } catch (error) {
      logger.error("❌ Lemlist delta sync failed:", error);
      throw error;
    }
  }
}

module.exports = LemlistSync;
