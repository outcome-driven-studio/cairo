const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const monitoring = require("../utils/monitoring");
const { query } = require("../utils/db");
const syncState = require("../utils/syncState");
const { eventKeyGenerator } = require("../utils/eventKeyGenerator");

class SyncRoutes {
  constructor(lemlistService, smartleadService) {
    this.lemlistService = lemlistService;
    this.smartleadService = smartleadService;

    this.handleInitialSync = this.handleInitialSync.bind(this);
    this.handleSmartleadDeltaSync = this.handleSmartleadDeltaSync.bind(this);
    this.handleLemlistDeltaSync = this.handleLemlistDeltaSync.bind(this);
  }

  async upsertUserSource(userData, campaign) {
    if (!userData.email) {
      logger.warn("[DB] ❌ Skipping invalid user data: missing email");
      return null;
    }
    const email = userData.email.trim().toLowerCase();
    try {
      const enrichmentProfile = {
        platform: userData.platform,
        name: userData.name,
      };
      const result = await query(
        `INSERT INTO user_source (email, linkedin_profile, enrichment_profile, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (email) DO UPDATE SET
           linkedin_profile = COALESCE(EXCLUDED.linkedin_profile, user_source.linkedin_profile),
           enrichment_profile = user_source.enrichment_profile || jsonb_build_object('name', COALESCE($4, 'Unknown')),
           updated_at = NOW()
         RETURNING *`,
        [email, userData.linkedin_url || null, enrichmentProfile, userData.name]
      );
      logger.info(`✅ Upserted user: ${email}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`[DB] ❌ Failed to upsert user ${email}:`, error.message);
      return null;
    }
  }

  async upsertEventSource(eventData) {
    try {
      const emailForDb = eventData.email
        ? eventData.email.trim().toLowerCase()
        : eventData.user_id;
      const isRealEmail =
        eventData.email && !eventData.email.startsWith("user_");

      const result = await query(
        `INSERT INTO event_source (user_id, event_key, event_type, event_timestamp, platform, meta, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (event_key) DO UPDATE SET
           event_type = EXCLUDED.event_type,
           event_timestamp = EXCLUDED.event_timestamp,
           meta = EXCLUDED.meta,
           updated_at = NOW()
         RETURNING *`,
        [
          emailForDb,
          eventData.event_key,
          eventData.event_type,
          eventData.event_timestamp,
          eventData.platform,
          eventData.meta,
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error(
        `[DB] ❌ Failed to upsert event for ${eventData.user_id}:`,
        error.message
      );
      return null;
    }
  }

  getEventTypeName(platform, eventType) {
    const platformPrefix = platform === "lemlist" ? "lemlist" : "smartlead";
    const mappings = {
      emailsSent: "email_sent",
      emailsOpened: "email_opened",
      emailsClicked: "link_clicked",
      emailsReplied: "email_replied",
      emailsBounced: "email_bounced",
      emailsFailed: "email_failed",
      emailsUnsubscribed: "unsubscribed",
      linkedin_visit: "linkedin_profile_visited",
      linkedin_message: "linkedin_message_sent",
      linkedin_invite: "linkedin_invite_sent",
      linkedin_replied: "linkedin_reply_received",
      sent: "email_sent",
      opened: "email_opened",
      clicked: "link_clicked",
      replied: "email_replied",
      positive: "positive_response",
    };

    const normalizedType =
      mappings[eventType] || eventType.toLowerCase().replace(/\s+/g, "_");
    return `${platformPrefix}_${normalizedType}`;
  }

  async processLemlistActivities(activities, leadMap) {
    const results = { processed: 0, errors: 0 };

    for (const activity of activities) {
      try {
        const lead = leadMap.get(activity.leadId);
        if (!lead) {
          logger.warn(`Lead not found for activity: ${activity.leadId}`);
          continue;
        }

        const userData = {
          email: lead.email,
          name: `${lead.firstName || ""} ${lead.lastName || ""}`.trim(),
          linkedin_url: lead.linkedinUrl,
          platform: "lemlist",
        };

        await this.upsertUserSource(userData, {
          name: activity.campaignName || "Unknown Campaign",
        });

        // Generate improved event key using the unified generator
        const improvedEventKey = eventKeyGenerator.generateLemlistKey(
          {
            id: activity._id || activity.id,
            type: activity.type,
            campaignId: activity.campaignId,
            createdAt: activity.createdAt,
            leadId: activity.leadId,
            campaignName: activity.campaignName,
            lead: { email: lead.email },
          },
          activity.campaignId,
          "playmaker"
        );

        const eventData = {
          user_id: lead.email,
          email: lead.email,
          event_key: improvedEventKey,
          event_type: this.getEventTypeName("lemlist", activity.type),
          event_timestamp: new Date(activity.createdAt),
          platform: "lemlist",
          meta: {
            campaign_id: activity.campaignId,
            campaign_name: activity.campaignName,
            lead_id: activity.leadId,
            activity_type: activity.type,
          },
        };

        await this.upsertEventSource(eventData);
        results.processed++;
      } catch (error) {
        logger.error(`Error processing Lemlist activity: ${error.message}`);
        results.errors++;
      }
    }

    return results;
  }

  async processSmartleadCampaign(campaign) {
    try {
      logger.info(`  -> Processing Smartlead campaign: ${campaign.name}`);

      const campaignId = campaign.id;
      const leads = await this.smartleadService.getLeads(campaignId);

      if (!leads || leads.length === 0) {
        logger.info(`    -> No leads found for campaign: ${campaign.name}`);
        return;
      }

      logger.info(
        `    -> Found ${leads.length} leads for campaign: ${campaign.name}`
      );

      for (const lead of leads) {
        if (!lead.lead || !lead.lead.email) {
          logger.warn(`    -> Invalid lead data, skipping`);
          continue;
        }

        const userData = {
          email: lead.lead.email,
          name: `${lead.lead.first_name || ""} ${
            lead.lead.last_name || ""
          }`.trim(),
          platform: "smartlead",
        };

        await this.upsertUserSource(userData, campaign);

        const eventData = {
          user_id: lead.lead.email,
          email: lead.lead.email,
          event_key: `smartlead_sent_${campaignId}_${lead.lead.id}`,
          event_type: this.getEventTypeName("smartlead", "sent"),
          event_timestamp: new Date(lead.sent_at || campaign.created_at),
          platform: "smartlead",
          meta: {
            campaign_id: campaignId,
            campaign_name: campaign.name,
            lead_id: lead.lead.id,
          },
        };

        await this.upsertEventSource(eventData);

        // Process other event types
        const eventTypes = ["opened", "clicked", "replied"];
        for (const eventType of eventTypes) {
          const eventKey = `${eventType}_count`;
          if (lead[eventKey] && lead[eventKey] > 0) {
            // Generate improved event key using the unified generator
            const improvedEventKey = eventKeyGenerator.generateSmartleadKey(
              {
                id: lead.lead.id,
                email_campaign_seq_id: campaignId,
                lead_id: lead.lead.id,
                sent_time: lead.sent_at || campaign.created_at,
              },
              eventType,
              campaignId,
              lead.lead.email,
              "playmaker"
            );

            const eventData = {
              user_id: lead.lead.email,
              email: lead.lead.email,
              event_key: improvedEventKey,
              event_type: this.getEventTypeName("smartlead", eventType),
              event_timestamp: new Date(lead.sent_at || campaign.created_at),
              platform: "smartlead",
              meta: {
                campaign_id: campaignId,
                campaign_name: campaign.name,
                lead_id: lead.lead.id,
                count: lead[eventKey],
              },
            };

            await this.upsertEventSource(eventData);
          }
        }
      }

      logger.info(
        `    -> ✅ Processed ${leads.length} leads for campaign: ${campaign.name}`
      );
    } catch (error) {
      logger.error(
        `Failed to process Smartlead campaign ${campaign.name}: ${error.message}`
      );
      logger.error(error.stack);
    }
  }

  async handleInitialSync(req, res) {
    try {
      logger.warn("--- TRIGGERED INITIAL SYNC ---");

      // 1. Fetch campaigns from both services
      const [lemlistCampaigns, smartleadCampaigns] = await Promise.all([
        this.lemlistService.getCampaigns(),
        this.smartleadService.getCampaigns(),
      ]);

      logger.warn(
        `[1/3] Found ${lemlistCampaigns.length} Lemlist campaigns and ${smartleadCampaigns.length} Smartlead campaigns.`
      );

      // 2. Combine and sort all campaigns by creation date
      const allCampaigns = [
        ...lemlistCampaigns.map((c) => ({ ...c, platform: "lemlist" })),
        ...smartleadCampaigns.map((c) => ({ ...c, platform: "smartlead" })),
      ];
      allCampaigns.sort(
        (a, b) =>
          new Date(a.createdAt || a.created_at) -
          new Date(b.createdAt || b.created_at)
      );

      logger.warn(
        `[2/3] Combined and sorted ${allCampaigns.length} total campaigns.`
      );

      // 3. Process campaigns in chronological order
      logger.warn(`[3/3] Processing all campaigns in order...`);
      for (const campaign of allCampaigns) {
        if (campaign.platform === "lemlist") {
          const leadMap = new Map();
          const leads = await this.lemlistService.getLeads(campaign._id);
          if (leads && Array.isArray(leads)) {
            for (const lead of leads) {
              leadMap.set(lead._id, lead);
            }
          }
          const activities = await this.lemlistService.getCampaignActivities(
            campaign._id
          );
          logger.warn(
            `  -> Processing ${activities.length} activities for Lemlist campaign: ${campaign.name}`
          );
          await this.processLemlistActivities(activities, leadMap);
        } else if (campaign.platform === "smartlead") {
          await this.processSmartleadCampaign(campaign);
        }
      }

      logger.warn("--- INITIAL SYNC COMPLETE ---");

      res.status(202).json({
        status: "accepted",
        message: "Initial sync processing started. Check logs for progress.",
      });
    } catch (error) {
      logger.error("Initial sync failed:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }

  async handleLemlistDeltaSync(req, res) {
    try {
      logger.info("Starting Lemlist delta sync...");

      const lastSyncTime = await syncState.getLastSyncTime("lemlist");
      const fromTime = lastSyncTime
        ? new Date(lastSyncTime)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const campaigns = await this.lemlistService.getCampaigns();
      let totalProcessed = 0;
      let totalErrors = 0;

      for (const campaign of campaigns) {
        const leadMap = new Map();
        const leads = await this.lemlistService.getLeads(campaign._id);
        if (leads && Array.isArray(leads)) {
          for (const lead of leads) {
            leadMap.set(lead._id, lead);
          }
        }

        const activities = await this.lemlistService.getCampaignActivities(
          campaign._id,
          fromTime.toISOString()
        );
        const results = await this.processLemlistActivities(
          activities,
          leadMap
        );

        totalProcessed += results.processed;
        totalErrors += results.errors;
      }

      await syncState.updateLastSyncTime("lemlist");

      res.json({
        status: "success",
        message: "Lemlist delta sync completed",
        processed: totalProcessed,
        errors: totalErrors,
      });
    } catch (error) {
      logger.error("Lemlist delta sync failed:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }

  async handleSmartleadDeltaSync(req, res) {
    try {
      logger.info("Starting Smartlead delta sync...");

      const lastSyncTime = await syncState.getLastSyncTime("smartlead");
      const campaigns = await this.smartleadService.getCampaigns();

      let totalProcessed = 0;

      for (const campaign of campaigns) {
        if (
          lastSyncTime &&
          new Date(campaign.created_at) < new Date(lastSyncTime)
        ) {
          continue; // Skip old campaigns
        }

        await this.processSmartleadCampaign(campaign);
        totalProcessed++;
      }

      await syncState.updateLastSyncTime("smartlead");

      res.json({
        status: "success",
        message: "Smartlead delta sync completed",
        campaignsProcessed: totalProcessed,
      });
    } catch (error) {
      logger.error("Smartlead delta sync failed:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }

  setupRoutes() {
    const router = express.Router();
    router.post("/initial-sync", this.handleInitialSync);
    router.post("/lemlist-delta", this.handleLemlistDeltaSync);
    router.post("/smartlead-delta", this.handleSmartleadDeltaSync);
    return router;
  }
}

module.exports = SyncRoutes;
