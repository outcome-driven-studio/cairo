# Cairo CDP User Guide 🏺

*A comprehensive guide to using Cairo Customer Data Platform - from setup to advanced features*

## 📋 Table of Contents

1. [What is Cairo CDP?](#what-is-cairo-cdp)
2. [Quick Start for Non-Technical Users](#quick-start-for-non-technical-users)
3. [Dashboard Overview](#dashboard-overview)
4. [Live Event Monitoring](#live-event-monitoring)
5. [Setting Up Data Sources](#setting-up-data-sources)
6. [Configuring Destinations](#configuring-destinations)
7. [For Developers](#for-developers)
8. [Troubleshooting](#troubleshooting)
9. [Frequently Asked Questions](#frequently-asked-questions)

---

## What is Cairo CDP?

Cairo CDP is a **Customer Data Platform** that helps you collect, organize, and route customer data from your applications to various tools and services. Think of it as a central hub that:

- **Collects** customer actions from your website or app
- **Processes** and organizes this data
- **Sends** it to tools like Slack, analytics platforms, CRM systems
- **Shows** you what's happening in real-time

### Key Benefits

✅ **One Integration, Multiple Destinations** - Connect once, send data anywhere
✅ **Real-Time Monitoring** - See customer actions as they happen
✅ **No Vendor Lock-in** - Open source and self-hosted
✅ **Developer Friendly** - Easy to integrate with existing applications
✅ **Privacy Compliant** - Full control over your data

---

## Quick Start for Non-Technical Users

### Step 1: Access the Dashboard

1. Open your web browser
2. Navigate to your Cairo CDP instance (usually `http://your-domain:8080`)
3. You'll see the main dashboard

### Step 2: Understanding the Dashboard

The dashboard has several key sections:

- **📊 Overview** - Summary of your data and activity
- **🔴 Live Events** - Real-time view of customer actions
- **📁 Sources** - Where your data comes from
- **📤 Destinations** - Where your data goes
- **👥 Users** - Customer profiles and information
- **⚙️ Settings** - Configuration options

### Step 3: Monitor Your First Events

1. Click on **"Live Events"** in the sidebar
2. You'll see a real-time feed of customer actions
3. Click on any event to see detailed information

---

## Dashboard Overview

### Main Statistics Cards

At the top of your dashboard, you'll see four key metrics:

1. **Total Events** - How many customer actions you've tracked
2. **Active Sources** - How many data sources are connected
3. **Destinations** - How many tools are receiving your data
4. **Tracked Users** - How many unique customers you're monitoring

### Charts and Analytics

- **Events Trend** - Shows how your event volume changes over time
- **Top Events** - Which customer actions are most common
- **Event Volume by Hour** - When your customers are most active

### Recent Activity Feed

This shows the latest important events, such as:
- New user signups
- System alerts
- Integration status updates

---

## Live Event Monitoring

The Live Events page is where you can see customer actions happening in real-time.

### Understanding the Event Stream

Each event shows:
- **Event Name** (e.g., "Page Viewed", "Button Clicked")
- **Timestamp** - When it happened
- **User Information** - Which customer performed the action
- **Source** - Which application sent the data

### Using Filters

You can filter events by:

1. **Search** - Type keywords to find specific events
2. **Event Types** - Show only certain types of actions
3. **Sources** - Filter by which application sent the data
4. **Date Range** - Look at events from specific time periods

### Event Details

Click on any event to see:
- Full event properties
- Customer context information
- Raw JSON data (for technical users)

### Export Events

You can download event data as JSON files for:
- Analysis in spreadsheet software
- Backup purposes
- Sharing with technical team members

---

## Setting Up Data Sources

Data sources are the applications that send customer data to Cairo CDP.

### What are Sources?

Sources are typically:
- Your website or web application
- Mobile applications
- Backend services
- Other tools that track customer behavior

### Common Source Types

1. **JavaScript/Browser** - For tracking website visitors
2. **Node.js Applications** - For server-side tracking
3. **React Applications** - For single-page applications
4. **Mobile Apps** - For iOS/Android applications

### Monitoring Source Health

In the Sources section, you can see:
- Which sources are actively sending data
- Last time each source sent data
- Error rates and connection status

---

## Configuring Destinations

Destinations are where your customer data gets sent after Cairo processes it.

### Popular Destinations

1. **Slack** - Get notifications about important customer actions
2. **Analytics Tools** - Send data to platforms like Mixpanel
3. **CRM Systems** - Update customer profiles automatically
4. **Webhooks** - Send data to custom applications

### Slack Integration

The Slack destination can send notifications for:
- New user signups
- Important customer actions
- High-value purchases
- Custom events you define

**Configuration Options:**
- Choose which events trigger notifications
- Set up different channels for different event types
- Configure message formatting
- Set alert thresholds (e.g., only for purchases over $100)

### Analytics Integration

Send customer behavior data to analytics platforms:
- Automatic event forwarding
- User identification sync
- Custom property mapping

---

## For Developers

### SDK Options

Cairo CDP provides SDKs for multiple platforms:

1. **Node.js SDK** - For server-side JavaScript applications
2. **React SDK** - For React applications with hooks and components
3. **Browser SDK** - For any website with JavaScript snippet

### Basic Integration Example

**Node.js Application:**
```javascript
const { CairoClient } = require('@cairo/node-sdk');

const cairo = new CairoClient({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com'
});

// Track a customer action
cairo.track('Purchase Completed', {
  amount: 99.99,
  product: 'Premium Plan'
}, {
  userId: 'user123'
});
```

**React Application:**
```jsx
import { useCairo } from '@cairo/react-sdk';

function CheckoutButton() {
  const { track } = useCairo();

  const handlePurchase = () => {
    track('Purchase Completed', {
      amount: 99.99,
      product: 'Premium Plan'
    });
  };

  return <button onClick={handlePurchase}>Buy Now</button>;
}
```

### API Endpoints

Cairo CDP exposes REST APIs for:
- Event tracking: `POST /api/events/track`
- User identification: `POST /api/events/identify`
- Batch operations: `POST /api/events/batch`
- Configuration: `GET/POST /api/config/sources`

---

## Troubleshooting

### Common Issues

**1. No Events Showing Up**
- Check that your SDK is configured with the correct URL
- Verify your write key is correct
- Check the network tab in browser developer tools for errors

**2. Slack Notifications Not Working**
- Verify your Slack webhook URL is correct
- Check that events match your configured filters
- Look for error messages in the dashboard

**3. High Event Volume**
- Use event filtering to reduce noise
- Consider batching events for better performance
- Monitor your database storage usage

### Getting Help

1. Check the **System Status** in Settings
2. Review error logs in the dashboard
3. Use the **Health Check** endpoint: `/health`
4. Check your browser's developer console for client-side issues

---

## Frequently Asked Questions

**Q: Is my data secure?**
A: Yes! Cairo CDP is self-hosted, meaning all your data stays on your own servers. You have complete control over data access and retention.

**Q: Can I migrate from other platforms like Segment?**
A: Yes! Cairo CDP uses a Segment-compatible API, making migration straightforward. You can often just change the endpoint URL.

**Q: How much does it cost?**
A: Cairo CDP is open source and free to use. You only pay for the infrastructure you run it on (servers, databases, etc.).

**Q: What's the difference between Sources and Destinations?**
A: Sources send data TO Cairo CDP (your apps), while Destinations receive data FROM Cairo CDP (Slack, analytics tools, etc.).

**Q: Can I customize the dashboard?**
A: The current dashboard provides standard functionality. For custom features, you can modify the open-source code or use the API to build custom interfaces.

**Q: How do I backup my data?**
A: Since Cairo CDP uses a PostgreSQL database, you can use standard database backup tools. Export functionality is also available for event data.

**Q: Can I use this for GDPR compliance?**
A: Yes! Being self-hosted gives you complete control over data handling, retention, and deletion - essential for GDPR compliance.

---

## Next Steps

1. **Start Small** - Begin by tracking just a few key events
2. **Add Destinations** - Set up Slack notifications for important actions
3. **Monitor Performance** - Use the dashboard to understand customer behavior
4. **Scale Up** - Add more sources and destinations as needed
5. **Customize** - Modify the open-source code for your specific needs

For technical documentation and API references, see:
- [SDK Quick Start Guide](./SDK_QUICK_START.md)
- [Event Tracking Guide](./docs/EVENT_TRACKING_GUIDE.md)
- [Cairo CDP Roadmap](./CAIRO_CDP_ROADMAP.md)

---

*Need help? Check our documentation or reach out to your technical team for assistance with setup and configuration.*