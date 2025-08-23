const { query } = require("../../utils/db");
const logger = require("../../utils/logger");
const LemlistService = require("../lemlistService");
const NamespaceService = require("../namespaceService");
const TableManagerService = require("../tableManagerService");

class LemlistSync {
  constructor() {
    this.lemlistService = new LemlistService(process.env.LEMLIST_API_KEY);
    this.namespaceService = new NamespaceService();
    this.tableManager = new TableManagerService();
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
        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error(`❌ Failed to create event for: ${eventData.email}`, error);
      return null;
    }
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
            // Insert event with namespace context
            await this.insertEventSource(
              {
                email: activity.lead.email,
                event_key: `lemlist_${activity.campaignId}_${
                  activity.id || Date.now()
                }`,
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
