# Cairo Documentation

Welcome to the Cairo documentation! Cairo is a comprehensive lead enrichment and scoring platform with built-in product analytics.

## 📚 Documentation Structure

### Getting Started

- [Event Tracking Quick Reference](./EVENT_TRACKING_QUICK_REFERENCE.md) - 5-minute setup guide
- [Event Tracking Guide](./EVENT_TRACKING_GUIDE.md) - Complete integration guide
- [API Documentation](./API_DOCUMENTATION.md) - Full API reference
- [Slack Alerts Examples](./SLACK_ALERTS_EXAMPLES.md) - Real-world Slack configuration examples

### System Documentation

- [Database Migrations](./DB_MIGRATIONS.md) - Database schema and migrations
- [Periodic Sync Troubleshooting](../PERIODIC_SYNC_TROUBLESHOOTING.md) - Sync system guide

### Integration Guides

- Event Tracking for Next.js apps
- Migration from Segment
- Webhook integrations

## 🎯 Quick Links

### For Product Engineers

Start here if you want to:

- [Send events from your Next.js app](./EVENT_TRACKING_GUIDE.md#nextjs-integration)
- [Track user behavior](./EVENT_TRACKING_QUICK_REFERENCE.md)
- [Migrate from Segment](./EVENT_TRACKING_GUIDE.md#migration-from-segment)

### For API Developers

- [REST API Reference](./API_DOCUMENTATION.md)
- [Event Tracking Endpoints](./EVENT_TRACKING_GUIDE.md#api-reference)
- [Webhook Endpoints](./API_DOCUMENTATION.md)

### For DevOps

- [Database Setup](./DB_MIGRATIONS.md)
- [Environment Configuration](../setup-env.js)
- [Periodic Sync Management](../PERIODIC_SYNC_TROUBLESHOOTING.md)

## 🔍 Finding What You Need

1. **Want to track events?** Start with [Event Tracking Quick Reference](./EVENT_TRACKING_QUICK_REFERENCE.md)
2. **Need API details?** Check [API Documentation](./API_DOCUMENTATION.md)
3. **Setting up the system?** See [Database Migrations](./DB_MIGRATIONS.md)
4. **Troubleshooting?** Visit [Periodic Sync Troubleshooting](../PERIODIC_SYNC_TROUBLESHOOTING.md)

## 📊 Cairo Overview

Cairo is designed to:

- **Track** product events and user behavior
- **Enrich** leads with data from Apollo, Hunter, and AI
- **Score** leads based on ICP fit and engagement
- **Sync** everything to your CRM (Attio) and analytics (Mixpanel)

## 🚀 Getting Started

### For Product Analytics

```bash
# Send your first event
curl -X POST https://your-cairo.com/api/events/track \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "user@example.com",
    "event": "signup_completed"
  }'
```

### For Lead Enrichment

```bash
# Enrich and score a lead
curl -X POST https://your-cairo.com/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lead@company.com"
  }'
```

## 📝 Contributing

To improve these docs:

1. Edit the markdown files directly
2. Keep examples practical and tested
3. Update the table of contents when adding sections
4. Include code examples in multiple languages when relevant

## 🔗 External Resources

- [Mixpanel Documentation](https://docs.mixpanel.com)
- [Attio API Reference](https://docs.attio.com)
- [Next.js Documentation](https://nextjs.org/docs)
