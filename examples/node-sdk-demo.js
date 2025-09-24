/**
 * Cairo Node.js SDK Demo
 *
 * This example demonstrates how to use the Cairo SDK to track events
 * from your Node.js applications.
 */

// In a real application, you would install the SDK:
// npm install @cairo/node-sdk
// const Cairo = require('@cairo/node-sdk');

// For this demo, we'll use the local SDK
const Cairo = require('../packages/node-sdk/src/index.ts');

// Initialize the Cairo SDK
const cairo = Cairo.init('demo-write-key-123', {
  dataPlaneUrl: 'http://localhost:8080',
  flushAt: 5,        // Flush after 5 events
  flushInterval: 5000, // Flush every 5 seconds
  debug: true        // Enable debug logging
});

/**
 * Example 1: Track a simple event
 */
function trackSimpleEvent() {
  console.log('\n📊 Tracking simple event...');

  cairo.track('Demo Event Started', {
    demo: true,
    timestamp: new Date().toISOString()
  });
}

/**
 * Example 2: Identify a user
 */
function identifyUser() {
  console.log('\n👤 Identifying user...');

  cairo.identify('user-123', {
    email: 'john.doe@example.com',
    name: 'John Doe',
    company: {
      name: 'Acme Corp',
      size: 100,
      industry: 'Technology'
    },
    plan: 'premium',
    createdAt: new Date('2024-01-01')
  });
}

/**
 * Example 3: Track a purchase event
 */
function trackPurchase() {
  console.log('\n💰 Tracking purchase...');

  cairo.track({
    userId: 'user-123',
    event: 'Product Purchased',
    properties: {
      productId: 'CAIRO-PRO-001',
      productName: 'Cairo Pro License',
      price: 299.99,
      currency: 'USD',
      quantity: 1,
      category: 'Software',
      paymentMethod: 'credit_card'
    },
    context: {
      app: {
        name: 'Cairo Demo App',
        version: '1.0.0'
      },
      campaign: {
        name: 'Holiday Sale',
        source: 'email',
        medium: 'newsletter'
      }
    }
  });
}

/**
 * Example 4: Track page view
 */
function trackPageView() {
  console.log('\n📄 Tracking page view...');

  cairo.page('Documentation', 'Getting Started', {
    url: '/docs/getting-started',
    referrer: 'https://google.com',
    title: 'Getting Started with Cairo CDP'
  });
}

/**
 * Example 5: Associate user with a group
 */
function associateGroup() {
  console.log('\n👥 Associating user with group...');

  cairo.group('company-456', {
    name: 'Acme Corporation',
    plan: 'enterprise',
    employees: 500,
    industry: 'Technology',
    website: 'https://acme-corp.com',
    founded: '2010-01-01'
  });
}

/**
 * Example 6: Create user alias
 */
function createAlias() {
  console.log('\n🔗 Creating user alias...');

  cairo.alias('user-123', 'anonymous-xyz-789');
}

/**
 * Example 7: Track multiple events in sequence
 */
async function trackUserJourney() {
  console.log('\n🚀 Tracking user journey...');

  // User signs up
  cairo.track({
    userId: 'user-456',
    event: 'User Signed Up',
    properties: {
      signupMethod: 'google',
      referralSource: 'product-hunt'
    }
  });

  // User completes onboarding
  cairo.track({
    userId: 'user-456',
    event: 'Onboarding Completed',
    properties: {
      steps: 5,
      timeToComplete: 180, // seconds
      skippedSteps: ['tutorial', 'team-invite']
    }
  });

  // User creates first project
  cairo.track({
    userId: 'user-456',
    event: 'Project Created',
    properties: {
      projectName: 'My First CDP',
      projectType: 'e-commerce',
      integrations: ['shopify', 'stripe', 'mailchimp']
    }
  });

  // User invites team member
  cairo.track({
    userId: 'user-456',
    event: 'Team Member Invited',
    properties: {
      invitedEmail: 'colleague@example.com',
      role: 'admin'
    }
  });
}

/**
 * Example 8: Track with callback
 */
function trackWithCallback() {
  console.log('\n📞 Tracking with callback...');

  cairo.track('Event With Callback', { test: true }, {}, (error, response) => {
    if (error) {
      console.error('❌ Track failed:', error);
    } else {
      console.log('✅ Track succeeded!');
    }
  });
}

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🎉 Starting Cairo SDK Demo\n');
  console.log('================================\n');

  // Run examples
  trackSimpleEvent();
  await sleep(1000);

  identifyUser();
  await sleep(1000);

  trackPurchase();
  await sleep(1000);

  trackPageView();
  await sleep(1000);

  associateGroup();
  await sleep(1000);

  createAlias();
  await sleep(1000);

  await trackUserJourney();
  await sleep(1000);

  trackWithCallback();
  await sleep(1000);

  // Flush remaining events
  console.log('\n🔄 Flushing remaining events...');
  await cairo.flush();

  console.log('\n================================');
  console.log('✨ Demo completed successfully!\n');

  // In a real app, you might want to reset on shutdown
  // cairo.reset();

  process.exit(0);
}

/**
 * Helper function to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await cairo.flush();
  process.exit(0);
});

// Run the demo
runDemo().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});