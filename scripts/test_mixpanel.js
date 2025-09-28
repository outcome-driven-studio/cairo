#!/usr/bin/env node

require('dotenv').config();
const logger = require('../src/utils/logger');
const MixpanelService = require('../src/services/mixpanelService');

async function testMixpanel() {
  logger.info('🧪 Testing Mixpanel Integration...\n');

  // Check if token exists
  const token = process.env.MIXPANEL_PROJECT_TOKEN;
  if (!token) {
    logger.error('❌ MIXPANEL_PROJECT_TOKEN not found in environment variables');
    logger.info('\nTo fix this:');
    logger.info('1. Get your Project Token from Mixpanel Settings > Project Settings');
    logger.info('2. Add it to your .env file: MIXPANEL_PROJECT_TOKEN="your_token_here"');
    logger.info('\nNote: You do NOT need the API Secret for event tracking - only the Project Token');
    process.exit(1);
  }

  logger.info('✅ Mixpanel Project Token found:', token.substring(0, 15) + '...');

  // Initialize Mixpanel
  const mixpanel = new MixpanelService(token);

  // Test data
  const testEmail = 'test-user@cairo.com';
  const timestamp = new Date().toISOString();

  try {
    // 1. Test user identification
    logger.info('\n1️⃣ Testing User Identification...');
    const identifyResult = await mixpanel.identify(testEmail, {
      $email: testEmail,
      $name: 'Test User',
      company: 'Cairo CDP',
      created_at: timestamp,
      namespace: 'forge-atlas',
      test_run: true
    });

    if (identifyResult.success) {
      logger.info('   ✅ User identified successfully');
    } else {
      logger.error('   ❌ User identification failed:', identifyResult.error);
    }

    // 2. Test event tracking
    logger.info('\n2️⃣ Testing Event Tracking...');

    const events = [
      {
        name: 'System Test Started',
        properties: {
          source: 'test_script',
          environment: process.env.NODE_ENV || 'development',
          timestamp
        }
      },
      {
        name: 'Lead Scored',
        properties: {
          score: 85,
          source: 'lemlist',
          campaign: 'Test Campaign',
          namespace: 'forge-atlas'
        }
      },
      {
        name: 'Email Engagement',
        properties: {
          action: 'opened',
          campaign_id: 'test-123',
          email_provider: 'lemlist',
          engagement_score: 75
        }
      }
    ];

    for (const event of events) {
      const result = await mixpanel.track(testEmail, event.name, event.properties);
      if (result.success) {
        logger.info(`   ✅ Tracked: "${event.name}"`);
      } else {
        logger.error(`   ❌ Failed to track "${event.name}":`, result.error);
      }
    }

    // 3. Test batch tracking
    logger.info('\n3️⃣ Testing Batch Event Tracking...');
    const batchPromises = [];
    for (let i = 1; i <= 5; i++) {
      batchPromises.push(
        mixpanel.track(`user${i}@cairo.com`, 'Batch Test Event', {
          batch_number: i,
          timestamp,
          test_type: 'batch'
        })
      );
    }

    const batchResults = await Promise.all(batchPromises);
    const successCount = batchResults.filter(r => r.success).length;
    logger.info(`   ✅ Batch tracking: ${successCount}/5 events sent successfully`);

    // 4. Display statistics
    logger.info('\n4️⃣ Mixpanel Session Statistics:');
    logger.info(`   📊 Events Tracked: ${mixpanel.stats.eventsTracked}`);
    logger.info(`   👤 Users Identified: ${mixpanel.stats.usersIdentified}`);
    logger.info(`   ❌ Errors: ${mixpanel.stats.errors}`);

    // 5. Provide dashboard link
    logger.info('\n' + '='.repeat(60));
    logger.info('✨ MIXPANEL TESTING COMPLETE!');
    logger.info('='.repeat(60));
    logger.info('\n📱 Check your Mixpanel dashboard:');
    logger.info('   https://mixpanel.com/report');
    logger.info('\n🔍 Look for these events:');
    logger.info('   - System Test Started');
    logger.info('   - Lead Scored');
    logger.info('   - Email Engagement');
    logger.info('   - Batch Test Event');
    logger.info('\n👤 Look for this test user:');
    logger.info('   - test-user@cairo.com');

    if (mixpanel.stats.errors > 0) {
      logger.warn('\n⚠️  Some events failed. Possible issues:');
      logger.info('   1. Check if your Project Token is correct');
      logger.info('   2. Verify Mixpanel project is active');
      logger.info('   3. Check network connectivity');
      logger.info('   4. Review Mixpanel project settings');
    } else {
      logger.info('\n✅ All tests passed! Mixpanel is working correctly.');
    }

  } catch (error) {
    logger.error('\n❌ Test failed with error:', error.message);
    logger.error('Stack trace:', error.stack);
  }

  process.exit(0);
}

if (require.main === module) {
  testMixpanel();
}

module.exports = { testMixpanel };