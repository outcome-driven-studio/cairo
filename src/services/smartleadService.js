const axios = require("axios");
const logger = require("../utils/logger");
const { addUserIfNotExists } = require("../utils/sourceUsersStore");
const { query } = require("../utils/db");

class SmartleadService {
  constructor(apiKey, limiter) {
    this.apiKey = apiKey || process.env.SMARTLEAD_API_KEY;
    this.limiter = limiter;
    this.baseURL = "https://server.smartlead.ai/api/v1";
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    logger.info("SmartleadService initialized with API key");
  }

  /**
   * Make a request with retries
   * @private
   */
  async makeRequest(config, retries = 0) {
    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      if (error.response?.status === 502 && retries < this.maxRetries) {
        logger.warn(
          `Smartlead API returned 502, retrying in ${
            this.retryDelay
          }ms (attempt ${retries + 1}/${this.maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        return this.makeRequest(config, retries + 1);
      }
      throw error;
    }
  }

  async getCampaigns() {
    logger.info("Getting Smartlead campaigns");
    // await this.limiter.waitForToken();

    try {
      logger.info(
        `Making request to ${this.baseURL}/campaigns?api_key=${this.apiKey}`
      );
      const res = await this.makeRequest({
        method: "GET",
        url: `${this.baseURL}/campaigns?api_key=${this.apiKey}`,
      });
      logger.debug(`Got ${res.data?.length || 0} campaigns from Smartlead`);

      const campaigns = res.data || [];

      // Sort campaigns by creation date (newest first)
      campaigns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Store campaigns in database
      if (campaigns) {
        for (const campaign of campaigns) {
          await query(
            `INSERT INTO campaigns (external_id, platform, name, status, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (external_id, platform) 
             DO UPDATE SET 
               name = EXCLUDED.name,
               status = EXCLUDED.status,
               metadata = EXCLUDED.metadata,
               created_at = EXCLUDED.created_at,
               updated_at = CURRENT_TIMESTAMP`,
            [
              campaign.id.toString(),
              "smartlead",
              campaign.name,
              campaign.status,
              JSON.stringify(campaign),
              campaign.created_at ? new Date(campaign.created_at) : null,
            ]
          );
          logger.info(`✅ Synced Smartlead campaign: ${campaign.name}`);
        }
      }

      return campaigns;
    } catch (error) {
      logger.error(`Error getting Smartlead campaigns: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getCampaignsByIds(campaignIds) {
    logger.info(`Getting Smartlead campaigns by ids: ${campaignIds}`);

    try {
      const campaigns = await this.getCampaigns();
      logger.info(`Found ${campaigns.length} campaigns`);

      const filteredCampaigns = campaigns.filter((c) =>
        campaignIds.includes(c.id.toString())
      );
      logger.info(`Found ${filteredCampaigns.length} campaigns`);

      logger.info(`Returning ${filteredCampaigns.length} campaigns`);

      if (filteredCampaigns.length === 0) {
        logger.warn(
          `No campaigns found for ids: ${JSON.stringify(campaignIds)}`
        );
        return [];
      }

      if (campaigns) {
        for (const campaign of filteredCampaigns) {
          await query(
            `INSERT INTO campaigns (external_id, platform, name, status, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (external_id, platform) 
             DO UPDATE SET 
               name = EXCLUDED.name,
               status = EXCLUDED.status,
               metadata = EXCLUDED.metadata,
               created_at = EXCLUDED.created_at,
               updated_at = CURRENT_TIMESTAMP`,
            [
              campaign.id.toString(),
              "smartlead",
              campaign.name,
              campaign.status,
              JSON.stringify(campaign),
              campaign.created_at ? new Date(campaign.created_at) : null,
            ]
          );
          logger.info(`✅ Synced Smartlead campaign: ${campaign.name}`);
        }
      }

      return filteredCampaigns;
    } catch (error) {
      logger.error(
        `Error getting Smartlead campaigns by ids: ${error.message}`
      );
      throw error;
    }
  }

  async getOpenedEmails(campaignId) {
    logger.info(`Getting opened emails for campaign ${campaignId}`);
    try {
      const url = `${this.baseURL}/campaigns/${campaignId}/statistics?api_key=${this.apiKey}&email_status=opened`;
      logger.debug(`Making request to Smartlead for opened emails`);
      const response = await this.makeRequest({
        method: "GET",
        url,
      });
      logger.debug(`Got ${response.data?.data?.length || 0} opened emails`);
      return response.data;
    } catch (error) {
      logger.error(`Error getting opened emails: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getSentEmails(campaignId) {
    logger.info(`Getting opened emails for campaign ${campaignId}`);
    try {
      const url = `${this.baseURL}/campaigns/${campaignId}/statistics?api_key=${this.apiKey}`;
      logger.debug(`Making request to Smartlead for opened emails`);
      const response = await this.makeRequest({
        method: "GET",
        url,
      });
      logger.debug(`Got ${response.data?.data?.length || 0} opened emails`);
      return response.data;
    } catch (error) {
      logger.error(`Error getting opened emails: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getClickedEmails(campaignId) {
    logger.info(`Getting clicked emails for campaign ${campaignId}`);
    try {
      const url = `${this.baseURL}/campaigns/${campaignId}/statistics?api_key=${this.apiKey}&email_status=clicked`;
      logger.debug(`Making request to Smartlead for clicked emails`);
      const response = await this.makeRequest({
        method: "GET",
        url,
      });
      logger.debug(`Got ${response.data?.data?.length || 0} clicked emails`);
      return response.data;
    } catch (error) {
      logger.error(`Error getting clicked emails: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getRepliedEmails(campaignId) {
    logger.info(`Getting replied emails for campaign ${campaignId}`);
    try {
      const url = `${this.baseURL}/campaigns/${campaignId}/statistics?api_key=${this.apiKey}&email_status=replied`;
      logger.debug(`Making request to Smartlead for replied emails`);
      const response = await this.makeRequest({
        method: "GET",
        url,
      });
      logger.debug(`Got ${response.data?.data?.length || 0} replied emails`);
      return response.data;
    } catch (error) {
      logger.error(`Error getting replied emails: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getLeads(campaignId) {
    logger.info(`Getting leads for campaign ${campaignId}`);
    const limit = 100;
    let offset = 0;
    let allLeads = [];
    let totalLeads = null;
    let firstResponse = null;

    try {
      while (true) {
        const url = `${this.baseURL}/campaigns/${campaignId}/leads?api_key=${this.apiKey}&offset=${offset}&limit=${limit}`;
        logger.debug(
          `Making request to Smartlead for leads (offset=${offset}, limit=${limit})`
        );
        const response = await this.makeRequest({
          method: "GET",
          url,
        });
        const respData = response.data;
        if (!firstResponse) {
          firstResponse = { ...respData };
        }
        const leads = respData?.data || [];
        if (totalLeads === null) {
          totalLeads = parseInt(respData.total_leads, 10) || 0;
        }
        allLeads = allLeads.concat(leads);
        logger.debug(
          `Fetched ${leads.length} leads (offset=${offset}). Total so far: ${allLeads.length}/${totalLeads}`
        );
        if (allLeads.length >= totalLeads || leads.length < limit) {
          break;
        }
        offset += limit;
      }
      if (firstResponse) {
        firstResponse.data = allLeads;
        firstResponse.total_leads = allLeads.length;
        logger.debug(`Got ALL leads: ${allLeads.length}`);
        return firstResponse;
      } else {
        return { data: [], total_leads: 0 };
      }
    } catch (error) {
      logger.error(`Error getting leads: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getEvents(startDate, endDate) {
    logger.info(`Getting Smartlead events from ${startDate} to ${endDate}`);

    try {
      // Add test user to verify sync process
      const testUser = await global.dedupStore.findOrCreateSourceUser({
        email: `force_${Date.now()}@test.com`,
        linkedin_profile: `https://linkedin.com/in/test_${Date.now()}`,
      });
      logger.info(`Test user created/verified: ${JSON.stringify(testUser)}`);

      const campaignsResponse = await this.getCampaigns();
      const campaigns = campaignsResponse || [];
      const allEvents = [];

      for (const campaign of campaigns) {
        if (!["ACTIVE", "COMPLETED", "PAUSED"].includes(campaign.status)) {
          logger.info(
            `Skipping campaign ${campaign.id} - ${campaign.name} (status: ${campaign.status})`
          );
          continue;
        }

        logger.info(`Processing campaign ${campaign.id} - ${campaign.name}`);

        // 1️⃣ Get leads
        const leadsData = await this.getLeads(campaign.id);
        logger.info(
          `Campaign ${campaign.id} - leads count: ${
            leadsData?.data?.length || 0
          }`
        );

        if (!leadsData?.data) {
          logger.warn(`[SKIP] No leads found for campaign ${campaign.id}`);
          continue;
        }

        if (leadsData?.data) {
          // Process each lead chunk
          for (const item of leadsData.data) {
            const lead = item.lead;
            if (!lead) {
              logger.warn(`[PROCESSING] Skipping item with no lead data`);
              continue;
            }

            const email = lead.email?.trim().toLowerCase();
            const linkedin = lead.linkedin_profile?.trim();
            const leadName = lead.name || lead.first_name || null;

            // Store in source_users
            if (email) {
              await addUserIfNotExists({
                email,
                linkedin_url: linkedin || null,
                lead_name: leadName,
                source: "smartlead",
              });
            }

            // Insert into sent_events if not exists
            const eventType = "email_sent";
            const eventKey = `${email}-${eventType}`;
            const existing = await query(
              "SELECT 1 FROM sent_events WHERE event_key = $1 LIMIT 1",
              [eventKey]
            );
            if (existing.rows.length === 0) {
              await query(
                `INSERT INTO sent_events (event_key, email, linkedin_profile, event_type, platform, created_at)
                 VALUES ($1, $2, $3, $4, 'smartlead', NOW())`,
                [eventKey, email, linkedin, eventType]
              );
              logger.info(`✅ Synced Smartlead event: ${eventKey}`);

              // Insert into events_source
              const event = {
                event_key: eventKey,
                platform: "smartlead",
                event_type: eventType,
                email: email,
                campaign_id: campaign.id,
                campaign_name: campaign.name,
                name: leadName,
                original_timestamp: lead.created_at || new Date().toISOString(),
                sent_at: lead.created_at || new Date().toISOString(),
                reply_content: null,
                action_items: null,
                status: "sent",
                data: JSON.stringify(lead),
                user_id: sourceUser.id,
                meta: JSON.stringify(lead),
              };
              await query(
                `
                INSERT INTO events_source (
                  event_key, platform, event_type, email,
                  campaign_id, campaign_name, name, original_timestamp,
                  sent_at, reply_content, action_items, status, data,
                  user_id, meta
                ) VALUES (
                  $1, $2, $3, $4,
                  $5, $6, $7, $8,
                  $9, $10, $11, $12, $13,
                  $14, $15
                );
              `,
                [
                  event.event_key,
                  event.platform,
                  event.event_type,
                  event.email,
                  event.campaign_id,
                  event.campaign_name,
                  event.name,
                  event.original_timestamp,
                  event.sent_at,
                  event.reply_content,
                  event.action_items,
                  event.status,
                  event.data,
                  event.user_id,
                  event.meta,
                ]
              );
            } else {
              logger.debug(`⚠️ Event already exists: ${eventKey}`);
            }

            // Log the raw lead data for debugging
            logger.debug(`[PROCESSING] Raw lead data: ${JSON.stringify(lead)}`);

            // Only require email, make LinkedIn optional
            if (!email) {
              logger.warn(
                `[PROCESSING] Skipping lead with no email: ${JSON.stringify(
                  lead
                )}`
              );
              continue;
            }

            logger.info(
              `[PROCESSING] Processing lead: email=${email}, linkedin=${
                linkedin || "not provided"
              }`
            );

            // Insert/update user in source_users table
            const sourceUser = await global.dedupStore.findOrCreateSourceUser({
              email,
              linkedin_profile: linkedin || null,
            });

            if (!sourceUser) {
              logger.error(
                `[PROCESSING] Failed to create/find source user for: ${email}`
              );
              continue;
            }

            logger.info(
              `[PROCESSING] Successfully processed user: ${email} (ID: ${sourceUser.id})`
            );

            // Push event as fresh lead
            allEvents.push({
              type: "email_sent",
              campaign_id: campaign.id,
              recipient_email: email,
              linkedin_profile: linkedin,
              date: lead.created_at || new Date().toISOString(),
            });

            // Update timestamp
            await global.dedupStore.updateSourceUserTimestamp(sourceUser.id);
          }

          // Check table status after processing all leads
          await global.dedupStore.checkTableStatus();
        }

        // 2️⃣ Get opened, clicked, replied
        const [opened, clicked, replied] = await Promise.all([
          this.getOpenedEmails(campaign.id),
          this.getClickedEmails(campaign.id),
          this.getRepliedEmails(campaign.id),
        ]);

        if (opened?.data) {
          allEvents.push(
            ...opened.data.map((e) => ({
              type: "email_opened",
              campaign_id: campaign.id,
              recipient_email: e.email,
              date: e.date || e.created_at || new Date().toISOString(),
            }))
          );
        }

        if (clicked?.data) {
          allEvents.push(
            ...clicked.data.map((e) => ({
              type: "email_clicked",
              campaign_id: campaign.id,
              recipient_email: e.email,
              date: e.date || e.created_at || new Date().toISOString(),
            }))
          );
        }

        if (replied?.data) {
          allEvents.push(
            ...replied.data.map((e) => ({
              type: "email_replied",
              campaign_id: campaign.id,
              recipient_email: e.email,
              date: e.date || e.created_at || new Date().toISOString(),
              reply_content: e.reply_message,
            }))
          );
        }
      }

      // Filter events by date range
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      startDateTime.setHours(0, 0, 0, 0);
      endDateTime.setHours(23, 59, 59, 999);

      logger.info(
        `Date range filter: ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`
      );
      logger.info(`Total events before filtering: ${allEvents.length}`);

      const filteredEvents = allEvents.filter((event) => {
        const eventDate = new Date(event.date);
        const isInRange =
          eventDate >= startDateTime && eventDate <= endDateTime;

        if (!isInRange) {
          logger.debug(
            `Event filtered out: ${event.type} for ${
              event.recipient_email
            } on ${event.date} (${eventDate.toISOString()})`
          );
        }

        return isInRange;
      });

      logger.info(`Total events processed in range: ${filteredEvents.length}`);
      return filteredEvents;
    } catch (error) {
      logger.error(`Error getting events: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  filterPositiveResponses(leads) {
    const filteredLeads = (leads.data || []).filter(
      (l) => l.reply_message && l.reply_message.length > 5
    );
    logger.debug(
      `Found ${filteredLeads.length} positive responses out of ${
        leads.data?.length || 0
      } leads`
    );
    return filteredLeads;
  }

  /**
   * Get events for a date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} List of events
   */

  async generateRepliesTable(startDate, endDate) {
    const events = await this.getEvents(startDate, endDate);
    const campaigns = await this.getCampaigns();

    // Create campaign name lookup
    const campaignNames = {};
    campaigns.data.forEach((campaign) => {
      campaignNames[campaign.id] = campaign.name;
    });

    // Filter and format reply events
    return events
      .filter((event) => event.type === "email_replied")
      .map((event) => ({
        email: event.recipient_email,
        campaignName: campaignNames[event.campaign_id] || "Unknown Campaign",
        replyContent: event.reply_content || "",
      }));
  }

  /**
   * Get campaign statistics for a date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} List of campaign statistics
   */
  async getCampaignStats(startDate, endDate) {
    logger.info(
      `Getting Smartlead campaign stats from ${startDate} to ${endDate}`
    );

    try {
      const campaigns = await this.getCampaigns();
      const stats = [];

      for (const campaign of campaigns.data || []) {
        // Only include active or completed campaigns
        if (!["ACTIVE", "COMPLETED"].includes(campaign.status)) {
          continue;
        }

        const [opened, clicked, replied] = await Promise.all([
          this.getOpenedEmails(campaign.id),
          this.getClickedEmails(campaign.id),
          this.getRepliedEmails(campaign.id),
        ]);

        stats.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          emailsSent: campaign.emailsSent || 0,
          opened: opened?.length || 0,
          clicked: clicked?.length || 0,
          replied: replied?.length || 0,
        });
      }

      return stats;
    } catch (error) {
      logger.error(`Error getting campaign stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign replies for a date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} List of campaign replies
   */
  async getCampaignReplies(startDate, endDate) {
    logger.info(
      `Getting Smartlead campaign replies from ${startDate} to ${endDate}`
    );

    try {
      const campaigns = await this.getCampaigns();
      const replies = [];

      for (const campaign of campaigns || []) {
        // Only include active or completed campaigns
        if (!["ACTIVE", "COMPLETED"].includes(campaign.status)) {
          continue;
        }

        const campaignReplies = await this.getRepliedEmails(campaign.id);

        if (campaignReplies?.data) {
          campaignReplies.data.forEach((reply) => {
            replies.push({
              email: reply.email,
              campaignName: campaign.name,
              replyContent: reply.reply_message || "No content available",
            });
          });
        }
      }

      return replies;
    } catch (error) {
      logger.error(`Error getting campaign replies: ${error.message}`);
      throw error;
    }
  }

  async getAllMappedLeads() {
    logger.info("Getting all mapped leads from Smartlead");
    const mappings = [];

    try {
      const campaignsResponse = await this.getCampaigns();
      const campaigns = campaignsResponse || [];

      for (const campaign of campaigns) {
        if (!["ACTIVE", "COMPLETED", "PAUSED"].includes(campaign.status)) {
          logger.info(
            `Skipping campaign ${campaign.id} - ${campaign.name} (status: ${campaign.status})`
          );
          continue;
        }

        logger.info(
          `Processing leads for campaign ${campaign.id} - ${campaign.name}`
        );
        const leadsData = await this.getLeads(campaign.id);

        if (!leadsData?.data) {
          logger.warn(`No leads found for campaign ${campaign.id}`);
          continue;
        }

        // Process leads and create mappings
        const campaignMappings = leadsData.data
          .filter(
            (item) => item.lead && item.lead.email && item.lead.linkedin_profile
          )
          .map((item) => {
            const lead = item.lead;
            return {
              linkedin_url: lead.linkedin_profile.trim(),
              email: lead.email.trim().toLowerCase(),
              lead_name:
                lead.name ||
                (lead.first_name
                  ? `${lead.first_name} ${lead.last_name || ""}`.trim()
                  : null),
              source: "smartlead",
            };
          });

        logger.info(
          `Found ${campaignMappings.length} valid mappings in campaign ${campaign.id}`
        );
        mappings.push(...campaignMappings);
      }

      // Log the mappings we're about to store
      logger.info("👀 Smartlead mappings to insert:", mappings);
      logger.info(`Total mappings to store: ${mappings.length}`);

      // Store the mappings
      if (mappings.length > 0) {
        await global.linkedinMappingService.bulkStoreMappings(mappings);
        logger.info(
          `Successfully stored ${mappings.length} Smartlead mappings`
        );
      } else {
        logger.warn("No valid mappings found to store");
      }

      return mappings;
    } catch (error) {
      logger.error(`Error getting mapped leads: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Get all activities for a campaign
   * @param {string} campaignId Campaign ID
   * @returns {Promise<Array>} List of activities
   */
  async getCampaignActivities(campaignId) {
    logger.info(`Getting activities for campaign ${campaignId}`);
    const activities = [];

    try {
      // Get leads
      const leadsData = await this.getLeads(campaignId);
      if (!leadsData?.data) {
        return [];
      }

      // Get all event types for each lead
      for (const item of leadsData.data) {
        const lead = item.lead;
        if (!lead?.email) continue;

        // Get opened emails
        const opened = await this.getOpenedEmails(campaignId);
        if (opened?.data) {
          for (const event of opened.data) {
            if (event.email === lead.email) {
              activities.push({
                ...event,
                type: "email_opened",
                email: lead.email,
                name: lead.name || lead.first_name,
                linkedin_url: lead.linkedin_profile,
                campaign_id: campaignId,
                timestamp: event.timestamp || new Date().toISOString(),
              });
            }
          }
        }

        // Get clicked emails
        const clicked = await this.getClickedEmails(campaignId);
        if (clicked?.data) {
          for (const event of clicked.data) {
            if (event.email === lead.email) {
              activities.push({
                ...event,
                type: "email_clicked",
                email: lead.email,
                name: lead.name || lead.first_name,
                linkedin_url: lead.linkedin_profile,
                campaign_id: campaignId,
                timestamp: event.timestamp || new Date().toISOString(),
              });
            }
          }
        }

        // Get replied emails
        const replied = await this.getRepliedEmails(campaignId);
        if (replied?.data) {
          for (const event of replied.data) {
            if (event.email === lead.email) {
              activities.push({
                ...event,
                type: "email_replied",
                email: lead.email,
                name: lead.name || lead.first_name,
                linkedin_url: lead.linkedin_profile,
                campaign_id: campaignId,
                timestamp: event.timestamp || new Date().toISOString(),
              });
            }
          }
        }

        // Add sent email event for each lead
        activities.push({
          type: "email_sent",
          email: lead.email,
          name: lead.name || lead.first_name,
          linkedin_url: lead.linkedin_profile,
          campaign_id: campaignId,
          timestamp: lead.created_at || new Date().toISOString(),
        });
      }

      logger.info(
        `Found ${activities.length} activities in campaign ${campaignId}`
      );
      return activities;
    } catch (error) {
      logger.error(`Error getting campaign activities: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}

module.exports = SmartleadService;
