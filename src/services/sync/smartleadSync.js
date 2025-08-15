const { query } = require('../../utils/db');
const logger = require('../../utils/logger');
const SmartleadService = require('../smartleadService');

class SmartleadSync {
  constructor() {
    this.smartleadService = new SmartleadService(process.env.SMARTLEAD_API_KEY);
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
    logger.info('Starting Smartlead delta sync...');

    try {
      const lastSync = await this.getLastSyncTimestamp();
      logger.info(`Last sync timestamp: ${lastSync || 'None (first sync)'}`);

      const campaigns = await this.smartleadService.getCampaigns();
      let totalLeads = 0;
      let newLeads = 0;

      for (const campaign of campaigns.data || []) {
        const leadsData = await this.smartleadService.getLeads(campaign.id);
        
        if (leadsData?.data) {
          for (const lead of leadsData.data) {
            totalLeads++;
            
            // Skip if lead is older than last sync
            if (lastSync && lead.created_at && new Date(lead.created_at) <= new Date(lastSync)) {
              continue;
            }

            if (!lead.email) continue;

            // Upsert user
            await this.upsertUserSource({
              email: lead.email,
              name: lead.name,
              platform: 'smartlead',
              linkedin_profile: lead.linkedin_url,
              created_at: lead.created_at || new Date()
            });

            // Insert event
            await this.insertEventSource({
              email: lead.email,
              event_type: 'lead_created',
              platform: 'smartlead',
              timestamp: lead.created_at || new Date(),
              metadata: {
                campaign: campaign.id,
                lead: lead
              },
              linkedin_profile: lead.linkedin_url
            });

            newLeads++;
          }
        }
      }

      logger.info(`✅ Smartlead delta sync completed: ${newLeads} new leads out of ${totalLeads} total`);
    } catch (error) {
      logger.error('❌ Smartlead delta sync failed:', error);
      throw error;
    }
  }
}

module.exports = SmartleadSync; 