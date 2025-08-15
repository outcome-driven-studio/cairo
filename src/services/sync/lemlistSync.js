const { query } = require('../../utils/db');
const logger = require('../../utils/logger');
const LemlistService = require('../lemlistService');

class LemlistSync {
  constructor() {
    this.lemlistService = new LemlistService(process.env.LEMLIST_API_KEY);
  }

  async upsertUserSource(userData) {
    if (!userData.email) return null;
    const email = userData.email.trim().toLowerCase();
    try {
      const result = await query(
        `INSERT INTO source_users (email, linkedin_url, name, platform)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           linkedin_url = COALESCE(EXCLUDED.linkedin_url, source_users.linkedin_url),
           name = COALESCE(EXCLUDED.name, source_users.name)
         RETURNING *`,
        [email, userData.linkedin_url, userData.name, userData.platform]
      );
      logger.info(`✅ Upserted user: ${email}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Failed to upsert user for: ${email}`, error);
      return null;
    }
  }

  async insertEventSource(eventData) {
    if (!eventData.email || !eventData.event_key) return null;
    try {
      const result = await query(
        `INSERT INTO event_source (event_key, email, event_type, platform, meta)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING *`,
        [eventData.event_key, eventData.email.toLowerCase(), eventData.event_type, eventData.platform, eventData.meta]
      );
      if (result.rows.length > 0) {
        logger.info(`✅ Created new event: ${eventData.event_key}`);
        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error(`Failed to create event for: ${eventData.email}`, error);
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
    logger.info('Starting Lemlist delta sync...');

    try {
      const lastSync = await this.getLastSyncTimestamp();
      logger.info(`Last sync timestamp: ${lastSync || 'None (first sync)'}`);

      const campaigns = await this.lemlistService.getCampaigns();
      let totalActivities = 0;
      let newActivities = 0;

      for (const campaign of campaigns) {
        const activities = await this.lemlistService.getCampaignActivities(campaign._id);
        
        for (const activity of activities) {
          totalActivities++;
          
          // Skip if activity is older than last sync
          if (lastSync && activity.date && new Date(activity.date) <= new Date(lastSync)) {
            continue;
          }

          if (!activity.lead?.email) continue;

          // Upsert user
          await this.upsertUserSource({
            email: activity.lead.email,
            name: activity.lead.firstName ? `${activity.lead.firstName} ${activity.lead.lastName || ''}`.trim() : activity.lead.name || null,
            company: activity.lead.company,
            platform: 'lemlist',
            linkedin_profile: activity.lead.linkedinUrl,
            created_at: activity.date || new Date()
          });

          // Insert event
          await this.insertEventSource({
            email: activity.lead.email,
            event_type: activity.type,
            platform: 'lemlist',
            timestamp: activity.date,
            metadata: {
              campaign: activity.campaignId,
              activity: activity
            },
            linkedin_profile: activity.lead.linkedinUrl
          });

          newActivities++;
        }
      }

      logger.info(`✅ Lemlist delta sync completed: ${newActivities} new activities out of ${totalActivities} total`);
    } catch (error) {
      logger.error('❌ Lemlist delta sync failed:', error);
      throw error;
    }
  }
}

module.exports = LemlistSync; 