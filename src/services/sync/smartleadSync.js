const { query } = require("../../utils/db");
const logger = require("../../utils/logger");
const SmartleadService = require("../smartleadService");
const NamespaceService = require("../namespaceService");
const TableManagerService = require("../tableManagerService");

class SmartleadSync {
  constructor() {
    this.smartleadService = new SmartleadService(process.env.SMARTLEAD_API_KEY);
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
          userData.platform || "smartlead",
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
          eventData.platform || "smartlead",
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
   * Get the last sync timestamp for Smartlead
   * @returns {Promise<string>} Last sync timestamp
   */
  async getLastSyncTimestamp() {
    const result = await query(
      `SELECT created_at 
       FROM event_source 
       WHERE platform = 'smartlead' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    return result.rows[0]?.created_at;
  }

  /**
   * Run delta sync for Smartlead
   */
  async run() {
    logger.info("Starting Smartlead delta sync...");

    try {
      const lastSync = await this.getLastSyncTimestamp();
      logger.info(`Last sync timestamp: ${lastSync || "None (first sync)"}`);

      const campaigns = await this.smartleadService.getCampaigns();
      let totalLeads = 0;
      let newLeads = 0;

      for (const campaign of campaigns.data || []) {
        logger.info(
          `[Smartlead] Processing campaign: ${campaign.name} (ID: ${campaign.id})`
        );

        const leadsData = await this.smartleadService.getLeads(campaign.id);

        // Detect namespace for this campaign
        const namespace =
          await this.namespaceService.detectNamespaceFromCampaign(
            campaign.name
          );

        if (leadsData?.data) {
          for (const lead of leadsData.data) {
            totalLeads++;

            // Skip if lead is older than last sync
            if (
              lastSync &&
              lead.created_at &&
              new Date(lead.created_at) <= new Date(lastSync)
            ) {
              continue;
            }

            if (!lead.email) continue;

            // Prepare user data
            const userData = {
              email: lead.email,
              name:
                lead.name ||
                `${lead.first_name || ""} ${lead.last_name || ""}`.trim() ||
                null,
              first_name: lead.first_name || null,
              last_name: lead.last_name || null,
              linkedin_profile: lead.linkedin_url,
              platform: "smartlead",
              created_at: lead.created_at || new Date(),
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
                  email: lead.email,
                  event_key: `smartlead_${campaign.id}_${lead.id}`,
                  event_type: "lead_created",
                  platform: "smartlead",
                  timestamp: lead.created_at || new Date(),
                  metadata: {
                    campaign_id: campaign.id,
                    campaign_name: campaign.name,
                    lead: lead,
                    namespace: namespace,
                  },
                },
                namespace
              );
            }

            newLeads++;
          }
        }

        logger.info(
          `[Smartlead] Completed campaign ${campaign.name} with namespace: ${namespace}`
        );
      }

      logger.info(
        `✅ Smartlead delta sync completed: ${newLeads} new leads out of ${totalLeads} total`
      );
    } catch (error) {
      logger.error("❌ Smartlead delta sync failed:", error);
      throw error;
    }
  }
}

module.exports = SmartleadSync;
