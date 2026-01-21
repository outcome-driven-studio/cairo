const axios = require("axios");
const logger = require("../utils/logger");
const {
  analyzeSentiment,
  getSentimentEmoji,
} = require("../utils/sentimentAnalyzer");
const { createRateLimiter } = require("../utils/unifiedRateLimiter");

const { query } = require("../utils/db");
const { parse } = require('csv-parse/sync');

class LemlistService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.LEMLIST_API_KEY;
    this.baseUrl = "https://api.lemlist.com/api";
    this.rateLimiter = createRateLimiter("lemlist");

    logger.info("LemlistService initialized with unified rate limiter");
  }

  /**
   * Make a rate-limited request
   * @private
   */
  async makeRequest(config) {
    return this.rateLimiter.makeRequest(() => axios(config));
  }

  /**
   * Get all campaigns
   * @returns {Promise<Array>} List of campaigns
   */
  async getCampaigns() {
    logger.info("Getting Lemlist campaigns");

    try {
      logger.debug(
        `Making request to ${this.baseUrl}/campaigns with access_token`
      );
      const response = await this.makeRequest({
        method: "GET",
        url: `${this.baseUrl}/campaigns`,
        params: { access_token: this.apiKey },
      });
      logger.debug(`Got ${response.data?.length || 0} campaigns from Lemlist`);

      const campaigns = response.data || [];

      // Sort campaigns by creation date (newest first)
      campaigns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
              campaign._id,
              'lemlist',
              campaign.name,
              campaign.status || 'unknown',
              JSON.stringify(campaign),
              campaign.createdAt ? new Date(campaign.createdAt) : null
            ]
          );
          logger.info(`✅ Synced Lemlist campaign: ${campaign.name}`);
        }
      }

      return campaigns;
    } catch (error) {
      logger.error(
        "Error fetching Lemlist campaigns:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get all activities across all campaigns
   * This method fetches activities globally which might avoid pagination limits
   * @param {Object} options - Optional parameters
   * @param {number} options.limit - Maximum number of activities to fetch (max 1000)
   * @param {string} options.type - Filter by activity type
   * @returns {Promise<Array>} List of all activities
   */
  async getAllActivities(options = {}) {
    logger.info("Getting all activities globally");

    const limit = Math.min(options.limit || 1000, 1000);
    const params = {
      access_token: this.apiKey,
      limit,
    };

    if (options.type) {
      params.type = options.type;
    }

    try {
      const response = await this.makeRequest({
        method: "GET",
        url: `${this.baseUrl}/activities`,
        params,
      });
      const activities = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];

      logger.info(`Fetched ${activities.length} activities globally`);

      // If we need more activities, we might need to implement pagination here too
      // But this gives us a baseline to compare against per-campaign fetching

      return activities;
    } catch (error) {
      logger.error(`Error fetching all activities: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign activities with LinkedIn interaction details
   * @param {string} campaignId - The campaign ID
   * @returns {Promise<Array>} List of activities with interaction details
   */
  async getCampaignActivities(campaignId) {
    logger.info(`Getting all activities for Lemlist campaign ${campaignId}`);

    const all = [];
    let offset = 0;
    const limit = 100; // Use a smaller limit to be safer with rate limits

    try {
      while (true) {
        logger.debug(`Fetching activities for campaign ${campaignId} with offset ${offset}`);
        const res = await this.makeRequest({
          method: "GET",
          url: `${this.baseUrl}/activities`,
          params: {
            campaignId,
            access_token: this.apiKey,
            limit,
            offset,
          },
        });

        const chunk = Array.isArray(res.data) ? res.data : [];
        if (chunk.length === 0) {
          logger.info(`No more activities found for campaign ${campaignId} at offset ${offset}.`);
          break;
        }

        all.push(...chunk);
        offset += chunk.length;
      }

      logger.info(`Found a total of ${all.length} activities in campaign ${campaignId}`);
      return all;
    } catch (error) {
      logger.error(`Error getting campaign activities: ${error.message}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Get campaign activities with fallback to global fetch
   * @param {string} campaignId - The campaign ID
   * @returns {Promise<Array>} List of activities with interaction details
   */
  async getCampaignActivitiesWithFallback(campaignId) {
    logger.info(`Getting activities for campaign ${campaignId} with fallback`);

    try {
      // First try the normal per-campaign approach
      const activities = await this.getCampaignActivities(campaignId);

      // If we suspect we're hitting pagination limits (e.g., got exactly 1000 or 5000 activities)
      if (activities.length % 1000 === 0 && activities.length > 0) {
        logger.warn(
          `Possible pagination limit hit for campaign ${campaignId}, trying global fetch`
        );

        // Fetch all activities globally and filter by campaign
        const allActivities = await this.getAllActivities({ limit: 1000 });
        const campaignActivities = allActivities.filter(
          (a) => a.campaignId === campaignId
        );

        logger.info(
          `Global fetch found ${campaignActivities.length} activities for campaign ${campaignId}`
        );

        // Return whichever has more activities
        return campaignActivities.length > activities.length
          ? campaignActivities
          : activities;
      }

      return activities;
    } catch (error) {
      logger.error(
        `Error getting campaign activities with fallback: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get interaction status from activity type
   * @param {string} type - The activity type
   * @returns {string} The interaction status
   */
  getInteractionStatus(type) {
    switch (type) {
      case "linkedinSent":
        return "Sent";
      case "linkedinOpened":
        return "Opened";
      case "linkedinReplied":
        return "Replied";
      default:
        return "Unknown";
    }
  }

  /**
   * Print LinkedIn interaction details to console
   * @param {Object} activity - The activity object
   */
  printLinkedInInteraction(activity) {
    if (!activity.isLinkedIn) return;

    // Get lead information from various possible locations in the activity object
    const leadEmail =
      activity.lead?.email ||
      activity.emailId ||
      activity.lead?.emailId ||
      activity.recipient?.email ||
      "Unknown Email";

    const firstName =
      activity.lead?.firstName ||
      activity.recipient?.firstName ||
      activity.leadFirstName ||
      "";

    const lastName =
      activity.lead?.lastName ||
      activity.recipient?.lastName ||
      activity.leadLastName ||
      "";

    const leadName =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || leadEmail;

    const companyName =
      activity.lead?.companyName ||
      activity.recipient?.companyName ||
      activity.leadCompanyName;

    logger.info("\n📊 LinkedIn Interaction:");
    logger.info(
      `👤 Lead: ${leadName}${companyName ? ` (${companyName})` : ""}`
    );
    logger.info(`📧 Email: ${leadEmail}`);
    logger.info(`➡️  Status: ${activity.interactionStatus}`);

    if (activity.type === "linkedinReplied" && activity.text) {
      logger.info(`💬 Message: "${activity.text}"`);
      logger.info(
        `${activity.sentimentEmoji} Sentiment: ${activity.sentiment}`
      );
    }

    if (activity.createdAt) {
      logger.info(`⏰ Time: ${new Date(activity.createdAt).toLocaleString()}`);
    }
    logger.info("----------------------------------------");
  }

  /**
   * Process campaign activities and print LinkedIn interactions
   * @param {string} campaignId - The campaign ID
   * @param {Object} options - Optional parameters
   * @param {boolean} options.exportToFile - Whether to export data to file
   * @param {string} options.exportFormat - Export format ('json' or 'csv')
   */
  async processLinkedInInteractions(campaignId, options = {}) {
    try {
      const activities = await this.getCampaignActivities(campaignId);

      // Filter LinkedIn activities and sort by date
      const linkedInActivities = activities
        .filter((a) => a.isLinkedIn)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      logger.info(
        `\n📱 Found ${linkedInActivities.length} LinkedIn interactions`
      );

      // Group activities by status
      const grouped = linkedInActivities.reduce((acc, activity) => {
        const status = activity.type;
        if (!acc[status]) acc[status] = [];
        acc[status].push(activity);
        return acc;
      }, {});

      // Print statistics
      const stats = {
        sent: linkedInActivities.filter((a) => a.type === "linkedinSent")
          .length,
        opened: linkedInActivities.filter((a) => a.type === "linkedinOpened")
          .length,
        replied: linkedInActivities.filter((a) => a.type === "linkedinReplied")
          .length,
      };

      logger.info("\n📈 Statistics:");
      logger.info(`📤 Sent: ${stats.sent}`);
      logger.info(`👁️  Opened: ${stats.opened}`);
      logger.info(`💬 Replied: ${stats.replied}`);

      // Print activities in table format
      logger.info("\n📊 Activities Summary:");
      logger.info(
        linkedInActivities.map((activity) => {
          const leadName = this.getLeadName(activity);
          const companyName = this.getCompanyName(activity);
          return {
            Name: leadName,
            Company: companyName || "N/A",
            Status: this.getInteractionStatus(activity.type),
            Message: activity.text
              ? activity.text.length > 30
                ? activity.text.substring(0, 27) + "..."
                : activity.text
              : "No message",
            Sentiment: activity.sentiment || "N/A",
            Time: new Date(activity.createdAt).toLocaleString(),
          };
        })
      );

                // LinkedIn reply tracking
      for (const activity of linkedInActivities) {
        if (activity.type === "linkedinReplied") {
          const lead = {
            email: this.getLeadEmail(activity),
            firstName:
              activity.lead?.firstName ||
              activity.recipient?.firstName ||
              activity.leadFirstName ||
              "",
            lastName:
              activity.lead?.lastName ||
              activity.recipient?.lastName ||
              activity.leadLastName ||
              "",
            companyName: this.getCompanyName(activity),
          };

          const campaign = {
            _id: campaignId,
            name: activity.campaignName || "LinkedIn Campaign",
          };

          logger.info(`Processed LinkedIn reply from ${lead.email}`);
        }
      }

      // Print grouped activities
      Object.entries(grouped).forEach(([status, items]) => {
        logger.info(
          `\n=== ${this.getInteractionStatus(status).toUpperCase()} (${items.length
          }) ===`
        );
        items.forEach((item) => {
          const leadName = this.getLeadName(item);
          const companyName = this.getCompanyName(item);
          logger.info(`${leadName}${companyName ? ` (${companyName})` : ""}`);
          if (item.text) {
            logger.info(`Message: "${item.text}"`);
            if (item.sentiment) {
              logger.info(
                `Sentiment: ${item.sentiment} ${item.sentimentEmoji}`
              );
            }
          }
          logger.info(`Time: ${new Date(item.createdAt).toLocaleString()}`);
          logger.info("----------------------------------------");
        });
      });

      // Export data if requested
      if (options.exportToFile) {
        const fs = require("fs");
        const exportData = linkedInActivities.map((activity) => ({
          name: this.getLeadName(activity),
          company: this.getCompanyName(activity),
          email: this.getLeadEmail(activity),
          status: this.getInteractionStatus(activity.type),
          message: activity.text || "",
          sentiment: activity.sentiment || "",
          sentimentEmoji: activity.sentimentEmoji || "",
          time: activity.createdAt,
        }));

        const filename = `linkedin-interactions-${campaignId}-${new Date().toISOString().split("T")[0]
          }`;

        if (options.exportFormat === "csv") {
          const csvContent = [
            [
              "Name",
              "Company",
              "Email",
              "Status",
              "Message",
              "Sentiment",
              "Time",
            ].join(","),
            ...exportData.map((row) =>
              [
                row.name,
                row.company,
                row.email,
                row.status,
                `"${row.message.replace(/"/g, '""')}"`,
                row.sentiment,
                row.time,
              ].join(",")
            ),
          ].join("\n");

          fs.writeFileSync(`${filename}.csv`, csvContent);
          logger.info(`\n💾 Exported data to ${filename}.csv`);
        } else {
          fs.writeFileSync(
            `${filename}.json`,
            JSON.stringify(exportData, null, 2)
          );
          logger.info(`\n💾 Exported data to ${filename}.json`);
        }
      }
    } catch (error) {
      logger.error("Error processing LinkedIn interactions:", error);
      throw error;
    }
  }

  /**
   * Get lead name from activity
   * @private
   */
  getLeadName(activity) {
    const firstName =
      activity.lead?.firstName ||
      activity.recipient?.firstName ||
      activity.leadFirstName ||
      "";

    const lastName =
      activity.lead?.lastName ||
      activity.recipient?.lastName ||
      activity.leadLastName ||
      "";

    const email = this.getLeadEmail(activity);
    return firstName && lastName
      ? `${firstName} ${lastName}`
      : firstName || email;
  }

  /**
   * Get company name from activity
   * @private
   */
  getCompanyName(activity) {
    return (
      activity.lead?.companyName ||
      activity.recipient?.companyName ||
      activity.leadCompanyName
    );
  }

  /**
   * Get lead email from activity
   * @private
   */
  getLeadEmail(activity) {
    return (
      activity.lead?.email ||
      activity.emailId ||
      activity.lead?.emailId ||
      activity.recipient?.email ||
      "Unknown Email"
    );
  }

  /**
   * Get activities for the current week
   * @returns {Promise<Array>} List of activities from this week
   */
  async getWeeklyActivities() {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Set to Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    logger.info(`Getting activities since ${startOfWeek.toISOString()}`);

    try {
      const response = await this.makeRequest({
        method: "GET",
        url: `${this.baseUrl}/activities`,
        params: {
          access_token: this.apiKey,
          limit: 1000,
          updatedSince: startOfWeek.toISOString(),
          includeLinkedIn: true // Ensure LinkedIn events are included
        }
      });

      const activities = Array.isArray(response.data) ? response.data : response.data?.data || [];

      // Process activities to ensure LinkedIn events are properly identified
      const processedActivities = activities.map(activity => {
        // Check if it's a LinkedIn event based on type
        const isLinkedIn = activity.type?.toLowerCase().startsWith('linkedin') ||
          activity.isLinkedIn === true;

        // Normalize the activity type
        let type = activity.type?.toLowerCase();
        if (isLinkedIn) {
          // Map LinkedIn event types to our standard format
          switch (type) {
            case 'linkedin_sent':
            case 'linkedinsent':
              type = 'linkedinsent';
              break;
            case 'linkedin_opened':
            case 'linkedinopened':
              type = 'linkedinopened';
              break;
            case 'linkedin_replied':
            case 'linkedinreplied':
              type = 'linkedinreplied';
              break;
            case 'linkedin_invite_done':
            case 'linkedininvitedone':
              type = 'linkedininvitedone';
              break;
          }
        }

        return {
          ...activity,
          type,
          isLinkedIn
        };
      });

      logger.info(`Fetched ${activities.length} activities for this week (${processedActivities.filter(a => a.isLinkedIn).length} LinkedIn events)`);
      return processedActivities;
    } catch (error) {
      logger.error(`Error fetching weekly activities: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate weekly LinkedIn summary
   * @returns {Promise<Object>} Summary of LinkedIn activities
   */
  async generateWeeklySummary() {
    const activities = await this.getWeeklyActivities();

    const summary = {
      contacted: 0,
      opened: 0,
      interaction: 0,
      answered: 0
    };

    // Only process LinkedIn events
    const linkedInActivities = activities.filter(activity => activity.isLinkedIn);

    linkedInActivities.forEach(activity => {
      const type = activity.type?.toLowerCase();

      // Count contacted (sent messages and connection invites)
      if (type === 'linkedinsent' || type === 'linkedininvitedone') {
        summary.contacted++;
      }

      // Count opened (profile views and message opens)
      if (type === 'linkedinopened' || type === 'linkedinvisit') {
        summary.opened++;
      }

      // Count answered (replies and connection accepts)
      if (type === 'linkedinreplied' || type === 'linkedinconnected') {
        summary.answered++;
      }

      // Count all LinkedIn interactions
      summary.interaction++;
    });

    logger.info(`Generated weekly summary: ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * Generate daily activity table
   * @returns {Promise<Array>} Daily activities grouped by campaign
   */
  async generateDailyTable() {
    const activities = await this.getWeeklyActivities();

    // Group activities by date and campaign
    const dailyGroups = {};

    activities.forEach(activity => {
      const date = new Date(activity.date).toISOString().split('T')[0];
      const campaignId = activity.campaignId;
      const type = activity.type?.toLowerCase();

      if (!dailyGroups[date]) {
        dailyGroups[date] = {};
      }

      if (!dailyGroups[date][campaignId]) {
        dailyGroups[date][campaignId] = {
          campaignName: activity.campaignName || 'Unknown Campaign',
          platform: 'Lemlist',
          sent: 0,
          opened: 0,
          replied: 0
        };
      }

      // Update counts
      if (type === 'linkedinsent' || type === 'linkedininvitedone') {
        dailyGroups[date][campaignId].sent++;
      } else if (type === 'linkedinopened') {
        dailyGroups[date][campaignId].opened++;
      } else if (type === 'linkedinreplied') {
        dailyGroups[date][campaignId].replied++;
      }
    });

    // Convert to array format
    const tableData = [];
    Object.entries(dailyGroups).forEach(([date, campaigns]) => {
      Object.values(campaigns).forEach(campaign => {
        tableData.push({
          date,
          ...campaign
        });
      });
    });

    // Sort by date descending
    return tableData.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Convert raw Lemlist activities to events
   * @param {Array} activities - Array of raw Lemlist activities
   * @returns {Array} Array of events
   */
  convertToEvents(activities) {
    return activities
      .filter(a => a.type && a.lead?.email)
      .map(activity => {
        let eventName = null;
        if (activity.type === 'emailSent') eventName = 'Email Sent';
        else if (activity.type === 'emailOpened') eventName = 'Email Opened';
        else if (activity.type === 'emailReplied') eventName = 'Email Replied';
        else return null; // skip unknown types

        return {
          event: eventName,
          platform: 'lemlist',
          leadEmail: activity.lead.email,
          properties: {
            campaignId: activity.campaignId,
            campaignName: activity.campaignName || 'Unknown Campaign',
            createdAt: activity.createdAt,
            ...(activity.text ? { text: activity.text } : {}),
          },
        };
      })
      .filter(Boolean);
  }

  async getLead(leadId) {
    if (!leadId) {
      logger.warn('Tried to get a lead without a leadId');
      return null;
    }
    logger.info(`Fetching lead from Lemlist API with leadId: ${leadId}`);
    try {
      const response = await this.makeRequest({
        method: 'GET',
        url: `${this.baseUrl}/leads/${leadId}`,
        params: { access_token: this.apiKey },
      });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching lead ${leadId}:`, error.response?.data || error.message);
      return null;
    }
  }

  async getLeads(campaignId) {
    logger.info(`Getting all leads for campaign ${campaignId}`);
    try {
      // Request the export endpoint for CSV
      const response = await this.makeRequest({
        method: "GET",
        url: `${this.baseUrl}/campaigns/${campaignId}/export/leads`,
        params: {
          access_token: this.apiKey,
          state: 'all',
          format: 'csv'
        },
        responseType: 'text', // Ensure we get raw text
      });

      // Parse the CSV data
      const csv = response.data;
      const leads = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });
      logger.info(`Parsed ${leads.length} leads for campaign ${campaignId}`);
      return leads;
    } catch (error) {
      logger.error(
        `Error getting leads for campaign ${campaignId}: ${error.message}`
      );
      throw error;
    }
  }
}

module.exports = LemlistService;
