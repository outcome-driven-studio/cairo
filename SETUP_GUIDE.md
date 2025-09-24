# Cairo CDP Setup Guide 🚀

*Get Cairo CDP running in 10 minutes*

## 🎯 Quick Setup (Non-Technical Users)

### Step 1: Get Your Instance Running

Your technical team should provide you with:
- **Dashboard URL** (e.g., `https://cairo.yourcompany.com`)
- **Login credentials** (if authentication is enabled)

### Step 2: First Login

1. Open your browser and navigate to the Cairo CDP dashboard URL
2. You should see the Cairo CDP dashboard with navigation on the left:
   - 📊 **Overview** - Main dashboard
   - 🔴 **Live Events** - Real-time event monitoring
   - 📁 **Sources** - Data input configuration
   - 📤 **Destinations** - Where data goes (Slack, etc.)
   - 👥 **Users** - Customer profiles
   - ⚙️ **Settings** - System configuration

### Step 3: Set Up Your First Slack Notification

1. Click **"Destinations"** in the sidebar
2. Click **"Add Destination"**
3. Select **"Slack"**
4. Ask your technical team for the Slack webhook URL
5. Configure which events should trigger notifications:
   - ✅ New user signups
   - ✅ Purchase completed
   - ✅ High-value events

### Step 4: Monitor Live Events

1. Click **"Live Events"** in the sidebar
2. You'll see customer actions happening in real-time
3. Click on any event to see details
4. Use the search box to find specific events or users

## 🛠️ Technical Setup (Developers)

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- Basic knowledge of environment variables

### 1. Clone and Install

```bash
git clone https://github.com/your-org/cairo.git
cd cairo
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```bash
# Database (Required)
POSTGRES_URL=postgresql://user:pass@host:5432/cairo?sslmode=require

# Server Configuration
PORT=8080
NODE_ENV=production

# Slack Integration (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_DEFAULT_CHANNEL=#general
SLACK_ALERT_EVENTS=user_signup,purchase_completed

# Analytics Integration (Optional)
MIXPANEL_PROJECT_TOKEN=your_mixpanel_token

# CRM Integration (Optional)
ATTIO_API_KEY=your_attio_api_key

# Enable Automatic Syncing (Optional)
USE_PERIODIC_SYNC=true
SYNC_INTERVAL_HOURS=4
```

### 3. Database Setup

```bash
# Run database migrations
npm run migrate

# Or manually create tables (they'll be auto-created on first run)
npm start
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

Your Cairo CDP instance will be available at:
- **Dashboard:** `http://localhost:8080`
- **API:** `http://localhost:8080/api`
- **Health Check:** `http://localhost:8080/health`

### 5. Install SDKs in Your Applications

**Node.js Application:**
```bash
npm install @cairo/node-sdk
```

```javascript
const { CairoClient } = require('@cairo/node-sdk');

const cairo = new CairoClient({
  writeKey: 'your-write-key', // Set this in Cairo dashboard
  host: 'http://localhost:8080'
});

// Track events
cairo.track('Purchase Completed', {
  amount: 99.99,
  product: 'Premium Plan'
}, { userId: 'user123' });
```

**React Application:**
```bash
npm install @cairo/react-sdk
```

```jsx
import { CairoProvider } from '@cairo/react-sdk';

function App() {
  return (
    <CairoProvider writeKey="your-write-key" config={{ host: 'http://localhost:8080' }}>
      <YourApp />
    </CairoProvider>
  );
}
```

**Any Website:**
```html
<script>
  !function(){var analytics=window.analytics=window.analytics||[];analytics.load=function(key,options){
    var script=document.createElement("script");script.type="text/javascript";script.async=true;
    script.src="http://localhost:8080/cairo.min.js";document.head.appendChild(script);
    analytics.initialize(key,options);};analytics.track=function(){analytics._queue=analytics._queue||[];
    analytics._queue.push(["track"].concat(Array.prototype.slice.call(arguments)));};
  }();

  analytics.load('your-write-key');
  analytics.track('Page Viewed');
</script>
```

## 🔧 Configuration

### Sources Configuration

Sources are automatically detected when they start sending data. Configure them in:
- **Dashboard:** Sources → Configure
- **API:** `POST /api/config/sources`

### Destinations Configuration

Set up where your data goes:

1. **Slack Notifications**
   - Get webhook URL from Slack
   - Configure event filters
   - Set up multiple channels

2. **Analytics Tools**
   - Mixpanel integration
   - Custom webhook endpoints
   - Data transformation rules

3. **CRM Systems**
   - Attio CRM sync
   - Custom API integrations
   - Field mapping configuration

## 🎯 First Steps After Setup

### For Business Users

1. **Monitor the Overview Dashboard**
   - Check that events are coming in
   - Review the activity feed
   - Look at user engagement metrics

2. **Set Up Slack Alerts**
   - Get notifications for important events
   - Configure different channels for different event types
   - Set up escalation rules

3. **Review Live Events**
   - Watch customer behavior in real-time
   - Identify interesting patterns
   - Export data for analysis

### For Developers

1. **Test Event Tracking**
   - Send test events from your app
   - Verify they appear in the dashboard
   - Check the console for any errors

2. **Set Up Destinations**
   - Configure Slack for immediate feedback
   - Set up analytics integrations
   - Test webhook delivery

3. **Monitor System Health**
   - Check `/health` endpoint
   - Review error logs
   - Set up monitoring alerts

## 🚨 Troubleshooting

### Common Issues

**Dashboard not loading:**
- Check that the server is running on the correct port
- Verify firewall settings
- Look for errors in browser console

**Events not appearing:**
- Verify SDK configuration (writeKey and host)
- Check network requests in browser developer tools
- Look for errors in server logs

**Slack notifications not working:**
- Verify webhook URL is correct
- Check that events match configured filters
- Test webhook URL independently

**Database connection errors:**
- Verify POSTGRES_URL is correctly formatted
- Check database server is running
- Ensure SSL settings match your database

### Getting Help

1. Check the **[User Guide](./USER_GUIDE.md)** for detailed instructions
2. Review **[Technical Documentation](./docs/README.md)**
3. Check system health at `/health` endpoint
4. Look at server logs for error messages

## 🎉 You're Ready!

Once setup is complete, you should have:

✅ Cairo CDP dashboard accessible
✅ Database connected and tables created
✅ At least one SDK integrated in your application
✅ Events flowing into the system
✅ Basic destinations configured (like Slack)
✅ Real-time monitoring working

**Next Steps:**
- Add more event tracking to your applications
- Set up additional destinations
- Configure user segmentation
- Explore advanced features like transformation rules

For ongoing usage, refer to the **[User Guide](./USER_GUIDE.md)** for detailed feature explanations.