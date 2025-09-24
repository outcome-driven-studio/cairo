# Cairo Event Tracking Guide

> Complete guide for integrating product analytics with Cairo's event tracking system

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [API Reference](#api-reference)
4. [Integration Examples](#integration-examples)
5. [Slack Alerts](#slack-alerts)
6. [Event Types & Best Practices](#event-types--best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Migration from Segment](#migration-from-segment)

## Quick Start

Cairo provides a simple HTTP API for tracking user events from your product. Events are stored in PostgreSQL and automatically synced to Mixpanel and Attio CRM.

### Basic Example

```bash
curl -X POST https://your-cairo-instance.com/api/events/track \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "user@example.com",
    "event": "button_clicked",
    "properties": {
      "button_name": "signup",
      "page": "/pricing",
      "variant": "blue"
    }
  }'
```

### JavaScript Example

```javascript
async function trackEvent(event, properties) {
  const response = await fetch(
    "https://your-cairo-instance.com/api/events/track",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_email: getCurrentUserEmail(),
        event: event,
        properties: properties,
        timestamp: new Date().toISOString(),
      }),
    }
  );

  return response.json();
}

// Usage
trackEvent("page_viewed", {
  page: "/dashboard",
  referrer: document.referrer,
});
```

## Core Concepts

### Events

Events represent actions users take in your product. Each event has:

- **user_email** (required): Unique identifier for the user
- **event** (required): Name of the event (e.g., "signup_completed")
- **properties** (optional): Additional context about the event
- **timestamp** (optional): When the event occurred (defaults to now)

### Event Flow

```
Your App → Cairo API → PostgreSQL
                    ↓
                    → Mixpanel (Analytics)
                    → Attio (CRM)
                    → Slack (Alerts for important events)
```

### Data Storage

- Events are stored in the `event_source` table
- Users are automatically created in `playmaker_user_source`
- Events are deduplicated using unique event keys
- All data is retained for historical analysis

## API Reference

### Track Single Event

**Endpoint:** `POST /api/events/track`

**Request Body:**

```json
{
  "user_email": "user@example.com",
  "event": "feature_used",
  "properties": {
    "feature_name": "export_data",
    "format": "csv",
    "rows_exported": 1500
  },
  "timestamp": "2024-11-14T10:30:00Z"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Event tracked successfully",
  "results": {
    "db": true,
    "mixpanel": "queued",
    "attio": "queued"
  }
}
```

### Track Batch Events

**Endpoint:** `POST /api/events/batch`

**Request Body:**

```json
{
  "events": [
    {
      "user_email": "user@example.com",
      "event": "page_viewed",
      "properties": { "page": "/home" },
      "timestamp": "2024-11-14T10:30:00Z"
    },
    {
      "user_email": "user@example.com",
      "event": "button_clicked",
      "properties": { "button": "get_started" },
      "timestamp": "2024-11-14T10:30:05Z"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "results": {
    "received": 2,
    "processed": 2,
    "errors": []
  }
}
```

### Identify User

**Endpoint:** `POST /api/events/identify`

**Request Body:**

```json
{
  "user_email": "user@example.com",
  "properties": {
    "name": "John Doe",
    "company": "Acme Corp",
    "plan": "premium",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "User identified successfully"
}
```

### Get Event Statistics

**Endpoint:** `GET /api/events/stats`

**Query Parameters:**

- `days` (optional): Number of days to include (default: 30)

**Response:**

```json
{
  "success": true,
  "stats": {
    "eventsReceived": 15234,
    "eventsStored": 15230,
    "mixpanelSent": 15100,
    "attioSent": 15050,
    "uniqueUsers": 523,
    "topEvents": [
      { "event": "page_viewed", "count": 8234 },
      { "event": "feature_used", "count": 3421 }
    ]
  }
}
```

### Health Check

**Endpoint:** `GET /api/events/health`

**Response:**

```json
{
  "success": true,
  "services": {
    "mixpanel": true,
    "attio": true,
    "database": true
  }
}
```

## Integration Examples

### Next.js Integration

#### 1. Create Event Tracking Client

```typescript
// lib/cairo-events.ts
interface EventProperties {
  [key: string]: any;
}

class CairoEvents {
  private apiUrl: string;
  private userEmail: string | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  setUser(email: string) {
    this.userEmail = email;
  }

  async track(event: string, properties?: EventProperties) {
    if (!this.userEmail) {
      console.warn("No user email set for tracking");
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/events/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: this.userEmail,
          event,
          properties,
          timestamp: new Date().toISOString(),
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Failed to track event:", error);
    }
  }

  async identify(properties: EventProperties) {
    if (!this.userEmail) return;

    try {
      await fetch(`${this.apiUrl}/api/events/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: this.userEmail,
          properties,
        }),
      });
    } catch (error) {
      console.error("Failed to identify user:", error);
    }
  }
}

export const cairo = new CairoEvents(process.env.NEXT_PUBLIC_CAIRO_URL!);
```

#### 2. React Hook for Event Tracking

```typescript
// hooks/useTracking.ts
import { useCallback } from "react";
import { cairo } from "@/lib/cairo-events";

export function useTracking() {
  const track = useCallback((event: string, properties?: any) => {
    cairo.track(event, properties);
  }, []);

  return { track };
}

// Usage in component
function MyComponent() {
  const { track } = useTracking();

  const handleClick = () => {
    track("button_clicked", {
      button_name: "subscribe",
      location: "header",
    });
  };

  return <button onClick={handleClick}>Subscribe</button>;
}
```

#### 3. Automatic Page View Tracking

```typescript
// app/layout.tsx (Next.js 13+)
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cairo } from "@/lib/cairo-events";

export default function RootLayout({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    cairo.track("page_viewed", {
      page: pathname,
      referrer: document.referrer,
      title: document.title,
    });
  }, [pathname]);

  return <>{children}</>;
}
```

#### 4. Server-Side Tracking

```typescript
// app/api/signup/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email, name, company } = await request.json();

  // Your signup logic here...

  // Track signup event server-side
  await fetch(`${process.env.CAIRO_URL}/api/events/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_email: email,
      event: "signup_completed",
      properties: {
        name,
        company,
        source: "organic",
        timestamp: new Date().toISOString(),
      },
    }),
  });

  return NextResponse.json({ success: true });
}
```

## Slack Alerts

Cairo can automatically send Slack notifications for important events. This is perfect for monitoring critical user actions like signups, payments, and high-value feature usage.

### Configuration

Set these environment variables to enable Slack alerts:

```bash
# Required
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Optional - Simple Configuration (comma-separated events)
SLACK_DEFAULT_CHANNEL=#alerts
SLACK_ALERT_EVENTS=signup_completed,payment_succeeded,trial_started,your_custom_event
SLACK_PAYMENT_THRESHOLD=100
SLACK_MAX_ALERTS_PER_MINUTE=10
```

#### Advanced Configuration (JSON Format)

You can also use JSON format in `SLACK_ALERT_EVENTS` for fine-grained control:

```bash
# Advanced JSON configuration
SLACK_ALERT_EVENTS='{
  "signup_completed": {
    "enabled": true,
    "channel": "#new-users",
    "color": "#36a64f"
  },
  "payment_succeeded": {
    "threshold": 100,
    "thresholdProperty": "amount",
    "channel": "#sales",
    "color": "#2eb886"
  },
  "trial_started": {
    "channel": "#trials",
    "properties": ["plan", "duration_days"],
    "template": "New {plan} trial started by {user_email} for {duration_days} days!"
  },
  "feature_used": {
    "threshold": 1000,
    "thresholdProperty": "usage_count",
    "title": "High Usage Alert",
    "color": "#ff9900"
  },
  "custom_milestone": {
    "enabled": true,
    "properties": ["milestone_name", "value"],
    "template": "🎉 {user_email} reached {milestone_name}: {value}!"
  }
}'
```

#### Configuration Options Per Event

| Option              | Description                         | Example                            |
| ------------------- | ----------------------------------- | ---------------------------------- |
| `enabled`           | Enable/disable specific event       | `true` or `false`                  |
| `channel`           | Override default Slack channel      | `"#sales-wins"`                    |
| `threshold`         | Minimum value to trigger alert      | `100`                              |
| `thresholdProperty` | Property to check against threshold | `"amount"` or `"count"`            |
| `properties`        | Required properties for alert       | `["plan", "company"]`              |
| `color`             | Custom color for message            | `"#36a64f"` (hex)                  |
| `title`             | Custom message title                | `"Big Deal Alert!"`                |
| `template`          | Custom message template             | `"User {user_email} did {action}"` |
| `footer`            | Custom footer text                  | `"Sales Team"`                     |

### Default Alert Events

If you don't configure `SLACK_ALERT_EVENTS`, Cairo defaults to alerting on:

- `signup_completed` - New user registrations
- `subscription_created` - New subscriptions
- `payment_succeeded` - Successful payments (respects threshold)
- `trial_started` - Trial activations

**You can completely customize this list** using the configurations above to track ANY events your application sends.

### Custom Alert Configuration

#### 1. Per-Event Channel Routing

```javascript
// Send to specific Slack channel
track("payment_succeeded", {
  amount: 999,
  plan: "enterprise",
  _slackChannel: "#big-deals", // Override default channel
});
```

#### 2. Threshold-Based Alerts

```javascript
// Automatically alerts if payment > SLACK_PAYMENT_THRESHOLD
track("payment_succeeded", {
  amount: 500, // Triggers alert if threshold is $100
  currency: "USD",
});

// Alert on high usage
track("feature_used", {
  feature_name: "bulk_export",
  usage_count: 5000, // Alerts if > configured threshold
});
```

#### 3. Include Extra Alert Context

```javascript
// Properties starting with "alert_" are highlighted in Slack
track("subscription_created", {
  plan: "enterprise",
  amount: 999,
  alert_account_value: "$50,000 ARR", // Highlighted in Slack
  alert_sales_rep: "@john", // Can mention users
});
```

### Slack Message Format

Events are formatted with:

- **Color coding**: Green for success, yellow for warnings, red for errors
- **User information**: Email of the user who triggered the event
- **Key properties**: Relevant event properties
- **Timestamp**: When the event occurred
- **Custom fields**: Any `alert_*` properties

Example Slack message:

```
🚀 Cairo Events
├── Event: Signup Completed
├── User: john@company.com
├── Plan: Premium
├── Source: Organic
└── Time: 2024-01-15 10:30:45
```

### Disabling Slack Alerts

To temporarily disable Slack alerts without removing the webhook:

1. Remove `SLACK_WEBHOOK_URL` from environment
2. Or set `SLACK_ALERT_EVENTS` to empty string
3. Or use event properties: `{ _skipSlack: true }`

## Event Types & Best Practices

### Common Event Naming Conventions

#### Page/Screen Events

- `page_viewed` - User viewed a page
- `screen_viewed` - Mobile screen view
- `tab_switched` - User switched tabs

#### Authentication Events

- `signup_started` - User began signup process
- `signup_completed` - User completed signup
- `login_succeeded` - Successful login
- `login_failed` - Failed login attempt
- `logout_completed` - User logged out
- `password_reset_requested` - Password reset initiated

#### Feature Usage Events

- `feature_used` - Generic feature usage
- `button_clicked` - User clicked a button
- `form_submitted` - Form submission
- `search_performed` - User performed search
- `filter_applied` - User applied filters
- `export_completed` - Data export completed

#### Engagement Events

- `session_started` - User session began
- `session_ended` - User session ended
- `notification_received` - User received notification
- `notification_clicked` - User clicked notification
- `email_opened` - Marketing email opened
- `email_clicked` - Link clicked in email

#### Transaction Events

- `trial_started` - Free trial began
- `trial_ended` - Free trial ended
- `subscription_created` - New subscription
- `subscription_cancelled` - Cancelled subscription
- `payment_succeeded` - Successful payment
- `payment_failed` - Failed payment

### Event Properties Best Practices

1. **Be Consistent**: Use the same property names across events

   ```json
   {
     "user_email": "user@example.com",
     "event": "feature_used",
     "properties": {
       "feature_name": "export_data", // Always use feature_name, not feature/name/feature_id
       "page": "/dashboard", // Always include page context
       "session_id": "abc123" // Track sessions for funnel analysis
     }
   }
   ```

2. **Include Context**: Always include relevant context

   ```json
   {
     "properties": {
       "page": "/pricing",
       "referrer": "https://google.com",
       "device_type": "desktop",
       "browser": "Chrome",
       "viewport_width": 1920
     }
   }
   ```

3. **Use Proper Types**: Send numbers as numbers, not strings

   ```json
   {
     "properties": {
       "item_count": 5, // ✓ Number
       "price": 29.99, // ✓ Number
       "user_id": "12345" // ✓ String for IDs
     }
   }
   ```

4. **Avoid PII**: Don't send sensitive information
   ```json
   {
     "properties": {
       "user_role": "admin", // ✓ Role is fine
       "password": "xxx", // ✗ Never send passwords
       "ssn": "xxx-xx-xxxx" // ✗ Never send SSN
     }
   }
   ```

## Troubleshooting

### Common Issues

#### 1. Events Not Appearing in Mixpanel

**Check:**

- Mixpanel project token is configured: `MIXPANEL_PROJECT_TOKEN`
- Check Cairo logs for Mixpanel errors
- Verify event names don't contain special characters
- Check `/api/events/stats` for sent counts

#### 2. User Not Found Errors

**Solution:**

- Cairo automatically creates users on first event
- Ensure `user_email` is a valid email format
- Check `playmaker_user_source` table for user record

#### 3. Duplicate Events

**Cairo prevents duplicates using:**

- Unique event keys based on event type, user, and timestamp
- `ON CONFLICT DO NOTHING` in database inserts
- Check event_key generation if seeing duplicates

#### 4. High Latency

**Optimize by:**

- Using batch endpoint for multiple events
- Implementing client-side queueing
- Checking database connection pool settings

### Debug Mode

Enable debug logging by setting:

```bash
LOG_LEVEL=debug
```

This will show detailed information about:

- Event processing steps
- External service calls
- Database operations
- Error details

## Migration from Segment

### API Compatibility

Cairo's API is designed to be similar to Segment's for easy migration:

| Segment                | Cairo                        | Notes                          |
| ---------------------- | ---------------------------- | ------------------------------ |
| `analytics.track()`    | `cairo.track()`              | Same parameters                |
| `analytics.identify()` | `cairo.identify()`           | Same parameters                |
| `analytics.page()`     | `cairo.track('page_viewed')` | Use track with page event      |
| `userId`               | `user_email`                 | Cairo uses email as identifier |

### Migration Steps

1. **Update Initialization**

   ```javascript
   // Before (Segment)
   analytics.load("YOUR_WRITE_KEY");

   // After (Cairo)
   import { cairo } from "./lib/cairo-events";
   cairo.setUser(userEmail);
   ```

2. **Update Track Calls**

   ```javascript
   // Before (Segment)
   analytics.track("Product Viewed", {
     product_id: "123",
     price: 29.99,
   });

   // After (Cairo)
   cairo.track("product_viewed", {
     product_id: "123",
     price: 29.99,
   });
   ```

3. **Update Identify Calls**

   ```javascript
   // Before (Segment)
   analytics.identify(userId, {
     email: "user@example.com",
     name: "John Doe",
   });

   // After (Cairo)
   cairo.setUser("user@example.com");
   cairo.identify({
     name: "John Doe",
   });
   ```

### Feature Comparison

| Feature               | Segment | Cairo                   |
| --------------------- | ------- | ----------------------- |
| Real-time tracking    | ✓       | ✓                       |
| Batch API             | ✓       | ✓                       |
| User identification   | ✓       | ✓                       |
| Anonymous tracking    | ✓       | ✗ (requires email)      |
| Multiple destinations | ✓       | Mixpanel + Attio        |
| Client libraries      | Many    | DIY (examples provided) |
| Replay/Debugging      | ✓       | Via logs                |

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md) - Full API reference
- [Database Schema](./DB_MIGRATIONS.md) - Event storage details
- [Cairo Architecture](../README.md) - System overview

## Support

For issues or questions:

1. Check the [troubleshooting](#troubleshooting) section
2. Review Cairo logs at `LOG_LEVEL=debug`
3. Check service health at `/api/events/health`
4. Open an issue in the Cairo repository
