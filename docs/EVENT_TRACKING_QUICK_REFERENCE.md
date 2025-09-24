# Cairo Event Tracking - Quick Reference

## 🚀 5-Minute Setup

### 1. Basic Event Tracking

```javascript
// Track any event
fetch("https://your-cairo.com/api/events/track", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_email: "user@example.com",
    event: "button_clicked",
    properties: { button: "signup" },
  }),
});
```

### 2. Common Events

```javascript
// Page view
track("page_viewed", {
  page: "/pricing",
  referrer: document.referrer,
});

// Feature usage
track("feature_used", {
  feature_name: "export_csv",
  item_count: 150,
});

// Sign up
track("signup_completed", {
  plan: "premium",
  source: "organic",
});
```

### 3. Identify User

```javascript
fetch("https://your-cairo.com/api/events/identify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_email: "user@example.com",
    properties: {
      name: "John Doe",
      company: "Acme Corp",
      plan: "premium",
    },
  }),
});
```

## 📊 API Endpoints

| Endpoint               | Method | Purpose               |
| ---------------------- | ------ | --------------------- |
| `/api/events/track`    | POST   | Track single event    |
| `/api/events/batch`    | POST   | Track multiple events |
| `/api/events/identify` | POST   | Set user properties   |
| `/api/events/stats`    | GET    | View statistics       |
| `/api/events/health`   | GET    | Check service health  |

## 📝 Event Payload Format

```json
{
  "user_email": "required@email.com",
  "event": "required_event_name",
  "properties": {
    "any": "optional",
    "data": "you want"
  },
  "timestamp": "2024-01-01T00:00:00Z" // optional
}
```

## 🎯 Best Practices

### Event Naming

- Use snake_case: `button_clicked`, not `Button Clicked`
- Be specific: `checkout_completed` not just `completed`
- Action-oriented: `feature_used` not `feature`

### Essential Properties

```javascript
{
  page: window.location.pathname,      // Always include
  referrer: document.referrer,         // For attribution
  session_id: getSessionId(),          // For funnels
  timestamp: new Date().toISOString()  // For accuracy
}
```

### Don't Send

- ❌ Passwords or tokens
- ❌ Credit card numbers
- ❌ Social security numbers
- ❌ Any PII you don't need

## 🔧 Next.js Quick Setup

```typescript
// lib/tracking.ts
export async function track(event: string, properties?: any) {
  const user = getCurrentUser();
  if (!user?.email) return;

  await fetch(`${process.env.NEXT_PUBLIC_CAIRO_URL}/api/events/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_email: user.email,
      event,
      properties,
    }),
  });
}

// In your components
import { track } from "@/lib/tracking";

function MyButton() {
  return (
    <button onClick={() => track("button_clicked", { button: "cta" })}>
      Click Me
    </button>
  );
}
```

## 🐛 Troubleshooting

| Issue                  | Check                                        |
| ---------------------- | -------------------------------------------- |
| Events not showing     | Verify `user_email` is valid                 |
| Mixpanel not receiving | Check `MIXPANEL_PROJECT_TOKEN` env var       |
| 400 errors             | Ensure `user_email` and `event` are provided |
| CORS errors            | Cairo needs CORS configuration               |

## 📈 What Happens to Your Events?

```
Your App → Cairo API → PostgreSQL (permanent storage)
                    ↓
                    → Mixpanel (analytics)
                    → Attio (CRM enrichment)
                    → Slack (alerts for important events)
```

### 🔔 Slack Alerts

Get notified instantly for ANY events you choose:

```javascript
// Simple configuration - just list events
SLACK_ALERT_EVENTS=signup_completed,payment_succeeded,custom_event

// Advanced configuration - full control per event
SLACK_ALERT_EVENTS='{
  "user_upgraded": {
    "channel": "#revenue",
    "threshold": 50,
    "color": "#36a64f"
  },
  "error_occurred": {
    "channel": "#alerts",
    "color": "#dc3545",
    "template": "⚠️ Error: {error_message} for {user_email}"
  },
  "custom_milestone": {
    "properties": ["milestone", "value"],
    "channel": "#achievements"
  }
}'

// Track any event - alerts based on your config
track("user_upgraded", { plan: "enterprise", amount: 299 });
track("error_occurred", { error_message: "Payment failed" });
track("custom_milestone", { milestone: "1000_api_calls", value: 1000 });
```

## 🔗 Useful Links

- [Full Documentation](./EVENT_TRACKING_GUIDE.md)
- [API Reference](./API_DOCUMENTATION.md)
- [Integration Examples](./EVENT_TRACKING_GUIDE.md#integration-examples)
