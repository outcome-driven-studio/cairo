# Slack Alerts Configuration Examples

This guide shows practical examples of configuring Slack alerts for different use cases.

## Basic Setup

### 1. Simple Event List

Track only the events you care about:

```bash
# Just list the events you want alerts for
SLACK_ALERT_EVENTS=user_signed_up,payment_received,subscription_cancelled,feature_launched
```

### 2. Different Channels per Event Type

Route different events to appropriate Slack channels:

```bash
SLACK_ALERT_EVENTS='{
  "user_signed_up": {
    "channel": "#growth"
  },
  "payment_received": {
    "channel": "#revenue",
    "threshold": 50
  },
  "error_occurred": {
    "channel": "#engineering-alerts",
    "color": "#dc3545"
  },
  "subscription_cancelled": {
    "channel": "#customer-success",
    "color": "#ff9900"
  }
}'
```

## Real-World Examples

### SaaS Application

Monitor key business metrics and user activities:

```javascript
// Environment configuration
process.env.SLACK_ALERT_EVENTS = JSON.stringify({
  // Revenue events
  payment_succeeded: {
    channel: "#revenue",
    threshold: 100,
    thresholdProperty: "amount",
    color: "#36a64f",
    template: "💰 New payment: ${amount} from {user_email}",
  },

  // User lifecycle
  trial_started: {
    channel: "#trials",
    properties: ["plan"],
    template: "🎯 New {plan} trial: {user_email}",
  },

  trial_converted: {
    channel: "#revenue",
    color: "#2eb886",
    properties: ["plan", "mrr"],
    template: "🎉 Trial converted! {user_email} → {plan} (${mrr}/mo)",
  },

  // Feature usage
  api_limit_reached: {
    channel: "#engineering",
    properties: ["limit", "current_usage"],
    color: "#ff9900",
    template: "⚠️ {user_email} hit API limit: {current_usage}/{limit}",
  },

  // Custom milestones
  milestone_reached: {
    channel: "#customer-success",
    properties: ["milestone_type", "value"],
    template: "🏆 {user_email} reached {milestone_type}: {value}!",
  },
});

// In your application code
track("payment_succeeded", {
  amount: 299,
  currency: "USD",
  plan: "professional",
});

track("milestone_reached", {
  milestone_type: "total_revenue",
  value: "$10,000",
});
```

### E-commerce Platform

Track sales, inventory, and customer behavior:

```javascript
process.env.SLACK_ALERT_EVENTS = JSON.stringify({
  order_placed: {
    channel: "#orders",
    threshold: 100,
    thresholdProperty: "total",
    template: "🛍️ New order #{order_id}: ${total} from {user_email}",
  },

  high_value_order: {
    channel: "#vip-sales",
    threshold: 1000,
    thresholdProperty: "total",
    color: "#gold",
    template: "💎 VIP Order! #{order_id}: ${total} - {items_count} items",
  },

  inventory_low: {
    channel: "#operations",
    color: "#ff9900",
    properties: ["product_name", "remaining_stock"],
    template: "📦 Low inventory: {product_name} - {remaining_stock} left",
  },

  cart_abandoned: {
    channel: "#marketing",
    threshold: 50,
    thresholdProperty: "cart_value",
    template: "🛒 Cart abandoned by {user_email}: ${cart_value}",
  },
});
```

### Marketing Agency

Track campaign performance and lead quality:

```javascript
process.env.SLACK_ALERT_EVENTS = JSON.stringify({
  lead_captured: {
    channel: "#new-leads",
    properties: ["source", "campaign"],
    template: "📧 New lead from {source}: {user_email} via {campaign}",
  },

  lead_qualified: {
    channel: "#sales",
    properties: ["score", "company"],
    color: "#36a64f",
    template: "✅ Qualified lead: {user_email} from {company} (Score: {score})",
  },

  campaign_milestone: {
    channel: "#campaigns",
    properties: ["campaign_name", "metric", "value"],
    template: "📊 {campaign_name} hit {metric}: {value}",
  },

  demo_scheduled: {
    channel: "#sales",
    properties: ["company", "meeting_time"],
    color: "#0084ff",
    template: "📅 Demo scheduled with {company} at {meeting_time}",
  },
});
```

## Advanced Patterns

### Conditional Alerts Based on Multiple Properties

```javascript
// Only alert on specific combinations
process.env.SLACK_ALERT_EVENTS = JSON.stringify({
  feature_used: {
    channel: "#product",
    properties: ["feature_name", "usage_count"],
    threshold: 100,
    thresholdProperty: "usage_count",
    template:
      "📈 High usage: {feature_name} used {usage_count} times by {user_email}",
  },

  user_behavior: {
    // Only alert if ALL required properties exist
    properties: ["action", "context", "value"],
    channel: "#analytics",
    template: "{user_email} {action} in {context}: {value}",
  },
});
```

### Dynamic Channel Routing in Code

You can override channels per event:

```javascript
// Send to different channels based on conditions
const channel = order.total > 5000 ? "#vip-orders" : "#orders";

track("order_placed", {
  order_id: order.id,
  total: order.total,
  _slackChannel: channel, // Override configured channel
});
```

### Custom Templates with Formatting

```javascript
process.env.SLACK_ALERT_EVENTS = JSON.stringify({
  weekly_report: {
    channel: "#metrics",
    template:
      "📊 Weekly Report for {user_email}\n" +
      "• Revenue: ${revenue}\n" +
      "• New Users: {new_users}\n" +
      "• Churn Rate: {churn_rate}%\n" +
      "• NPS Score: {nps_score}",
  },

  deployment_completed: {
    channel: "#deployments",
    color: "#36a64f",
    template:
      "🚀 Deployment Complete\n" +
      "Version: {version}\n" +
      "Environment: {environment}\n" +
      "Deployed by: {user_email}\n" +
      "Duration: {duration}s",
  },
});
```

## Best Practices

### 1. Use Meaningful Event Names

```javascript
// Good - specific and actionable
track("subscription_upgraded", { from: "basic", to: "pro" });
track("api_rate_limit_exceeded", { limit: 1000, current: 1050 });

// Avoid - too generic
track("user_action", { type: "upgrade" });
track("event_occurred", { what: "rate_limit" });
```

### 2. Include Relevant Context

```javascript
// Include context that helps understand the alert
track("payment_failed", {
  reason: "insufficient_funds",
  amount: 99.99,
  retry_count: 3,
  customer_lifetime_value: 2400,
});
```

### 3. Use Thresholds Wisely

```javascript
{
  "support_ticket_created": {
    "channel": "#support",
    // Only alert on high-priority tickets
    "properties": ["priority"],
    "threshold": 3,
    "thresholdProperty": "priority_level"
  }
}
```

### 4. Avoid Alert Fatigue

- Don't alert on every single event
- Set appropriate thresholds
- Use different channels for different urgency levels
- Consider daily/weekly summaries for non-critical events

## Testing Your Configuration

Test your Slack alerts configuration:

```javascript
// Test script
const testEvents = [
  {
    event: "payment_succeeded",
    data: { amount: 150, user_email: "test@example.com" },
  },
  {
    event: "custom_event",
    data: { user_email: "test@example.com", value: "test" },
  },
];

testEvents.forEach(({ event, data }) => {
  fetch("http://localhost:8080/api/events/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      user_email: data.user_email,
      properties: data,
    }),
  });
});
```

## Troubleshooting

### Events Not Appearing in Slack

1. Check webhook URL is correct
2. Verify event name matches configuration
3. Check thresholds and required properties
4. Look at Cairo logs for errors
5. Test webhook directly:

```bash
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

### Rate Limiting Issues

If you're hitting rate limits:

```javascript
// Increase rate limit
SLACK_MAX_ALERTS_PER_MINUTE = 30;

// Or batch similar events in your app
const batchedAlerts = [];
setInterval(() => {
  if (batchedAlerts.length > 0) {
    track("batched_alerts", {
      count: batchedAlerts.length,
      summary: batchedAlerts.slice(0, 5),
    });
    batchedAlerts.length = 0;
  }
}, 60000); // Every minute
```

