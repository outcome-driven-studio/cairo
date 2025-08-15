require('dotenv').config();
const { query } = require('./utils/db');
const logger = require('./utils/logger');
const DedupStore = require('./utils/dedupStore');
const { addUserIfNotExists } = require('./utils/sourceUsersStore');

async function populateTestData() {
  try {
    logger.info('Creating test data...');

    // 1. Create test users
    const users = [
      {
        email: 'test1@example.com',
        linkedin_url: 'https://linkedin.com/in/test1',
        lead_name: 'Test User 1',
        source: 'smartlead'
      },
      {
        email: 'test2@example.com',
        linkedin_url: null,
        lead_name: 'Test User 2',
        source: 'lemlist'
      },
      {
        email: 'test3@example.com',
        linkedin_url: 'https://linkedin.com/in/test3',
        lead_name: 'Test User 3',
        source: 'smartlead'
      }
    ];

    for (const user of users) {
      const result = await addUserIfNotExists(user);
      logger.info(`Created user: ${user.email}`);
    }

    // 2. Create test campaigns
    const campaigns = [
      {
        external_id: 'camp1',
        platform: 'smartlead',
        name: 'Test Campaign 1',
        status: 'active',
        metadata: { settings: { max_leads: 100 } }
      },
      {
        external_id: 'camp2',
        platform: 'lemlist',
        name: 'Test Campaign 2',
        status: 'paused',
        metadata: { settings: { max_leads: 200 } }
      }
    ];

    for (const campaign of campaigns) {
      await query(
        `INSERT INTO campaigns (external_id, platform, name, status, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (external_id, platform) DO UPDATE 
         SET name = EXCLUDED.name,
             status = EXCLUDED.status,
             metadata = EXCLUDED.metadata`,
        [campaign.external_id, campaign.platform, campaign.name, campaign.status, campaign.metadata]
      );
      logger.info(`Created campaign: ${campaign.name}`);
    }

    // 3. Create test events
    const dedupStore = new DedupStore();
    const events = [
      {
        email: 'test1@example.com',
        event_type: 'email_sent',
        platform: 'smartlead',
        campaign_id: 'camp1',
        timestamp: new Date(),
        metadata: { subject: 'Test Email 1' }
      },
      {
        email: 'test2@example.com',
        event_type: 'email_opened',
        platform: 'lemlist',
        campaign_id: 'camp2',
        timestamp: new Date(),
        metadata: { opened_at: new Date() }
      },
      {
        email: 'test3@example.com',
        event_type: 'email_replied',
        platform: 'smartlead',
        campaign_id: 'camp1',
        timestamp: new Date(),
        metadata: { reply_sentiment: 'positive' }
      }
    ];

    for (const event of events) {
      await dedupStore.storeEvent(event);
      logger.info(`Created event: ${event.email} - ${event.event_type}`);
    }

    // 4. Verify data
    const userCount = await query('SELECT COUNT(*) FROM source_users');
    const campaignCount = await query('SELECT COUNT(*) FROM campaigns');
    const eventCount = await query('SELECT COUNT(*) FROM sent_events');

    logger.info('\nData populated:');
    logger.info(`- Users: ${userCount.rows[0].count}`);
    logger.info(`- Campaigns: ${campaignCount.rows[0].count}`);
    logger.info(`- Events: ${eventCount.rows[0].count}`);

  } catch (error) {
    logger.error('Error populating test data:', error);
  }
}

// Run the population
populateTestData().then(() => {
  logger.info('Test data population complete');
  process.exit(0);
}).catch(error => {
  logger.error('Failed to populate test data:', error);
  process.exit(1);
}); 