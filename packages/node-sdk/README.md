# @cairo/node-sdk

Official Node.js SDK for Cairo CDP - Track events, identify users, and sync data from your Node.js applications.

## Installation

```bash
npm install @cairo/node-sdk
# or
yarn add @cairo/node-sdk
# or
pnpm add @cairo/node-sdk
```

## Quick Start

```javascript
const Cairo = require('@cairo/node-sdk');

// Initialize the SDK
const cairo = Cairo.init('YOUR_WRITE_KEY', {
  dataPlaneUrl: 'https://api.your-cairo-instance.com', // Default: http://localhost:8080
  flushAt: 20,        // Batch size (default: 20)
  flushInterval: 10000, // Batch interval in ms (default: 10000)
});

// Track an event
cairo.track({
  userId: 'user123',
  event: 'Product Purchased',
  properties: {
    productId: 'P123',
    productName: 'Cairo Pro',
    price: 99.99,
    currency: 'USD'
  }
});

// Identify a user
cairo.identify({
  userId: 'user123',
  traits: {
    email: 'user@example.com',
    name: 'John Doe',
    plan: 'premium',
    company: {
      name: 'Acme Corp',
      size: 100
    }
  }
});

// Track page views
cairo.page({
  userId: 'user123',
  category: 'Product',
  name: 'Cairo Dashboard',
  properties: {
    url: 'https://app.example.com/dashboard',
    referrer: 'https://google.com'
  }
});

// Associate user with a group
cairo.group({
  userId: 'user123',
  groupId: 'company456',
  traits: {
    name: 'Acme Corp',
    plan: 'enterprise',
    employees: 100
  }
});

// Create an alias for a user
cairo.alias({
  userId: 'user123',
  previousId: 'temp-user-id'
});

// Flush events immediately
await cairo.flush();
```

## TypeScript Support

The SDK includes full TypeScript support:

```typescript
import Cairo, { TrackMessage, IdentifyMessage } from '@cairo/node-sdk';

const cairo = Cairo.init('YOUR_WRITE_KEY', {
  dataPlaneUrl: 'https://api.cairo.io',
  debug: true
});

// Type-safe event tracking
const trackMessage: TrackMessage = {
  userId: 'user123',
  event: 'Subscription Started',
  properties: {
    plan: 'premium',
    price: 29.99
  },
  context: {
    app: {
      name: 'My App',
      version: '1.0.0'
    }
  }
};

cairo.track(trackMessage);
```

## API Methods

### `Cairo.init(writeKey, options)`

Initialize the Cairo SDK with your write key and optional configuration.

**Options:**
- `dataPlaneUrl` (string): Your Cairo server URL
- `flushAt` (number): Number of events to batch before sending (default: 20)
- `flushInterval` (number): Time in ms between automatic flushes (default: 10000)
- `maxRetries` (number): Maximum retry attempts for failed requests (default: 3)
- `timeout` (number): Request timeout in ms (default: 10000)
- `debug` (boolean): Enable debug logging (default: false)
- `enable` (boolean): Enable/disable the SDK (default: true)

### `track(event, properties, context, callback)`

Track custom events.

```javascript
// Simple usage
cairo.track('Button Clicked', { button: 'signup' });

// With user ID
cairo.track({
  userId: 'user123',
  event: 'Purchase Completed',
  properties: {
    revenue: 99.99,
    products: ['item1', 'item2']
  }
});

// With callback
cairo.track('Event Name', { prop: 'value' }, {}, (err, response) => {
  if (err) console.error('Track failed:', err);
});
```

### `identify(userId, traits, context, callback)`

Identify users and update their traits.

```javascript
cairo.identify('user123', {
  email: 'user@example.com',
  name: 'John Doe',
  createdAt: new Date('2024-01-01')
});
```

### `page(category, name, properties, context, callback)`

Track page views (typically used in server-side rendering).

```javascript
cairo.page('Docs', 'Getting Started', {
  url: '/docs/getting-started',
  referrer: document.referrer
});
```

### `screen(category, name, properties, context, callback)`

Track mobile screen views.

```javascript
cairo.screen('Onboarding', 'Welcome Screen', {
  variant: 'A'
});
```

### `group(groupId, traits, context, callback)`

Associate a user with a group/organization.

```javascript
cairo.group('company123', {
  name: 'Acme Corp',
  industry: 'Technology',
  employees: 1000
});
```

### `alias(userId, previousId, context, callback)`

Create an alias linking two user identities.

```javascript
cairo.alias('user123', 'anonymous-id-456');
```

### `flush(callback)`

Manually flush the event queue.

```javascript
// With async/await
await cairo.flush();

// With callback
cairo.flush((err) => {
  if (err) console.error('Flush failed:', err);
  else console.log('Events sent successfully');
});
```

### `reset()`

Clear the event queue and reset the client.

```javascript
cairo.reset();
```

## Advanced Usage

### Custom Context

Add custom context to all events:

```javascript
cairo.track({
  userId: 'user123',
  event: 'Feature Used',
  properties: { feature: 'export' },
  context: {
    app: {
      name: 'My App',
      version: '2.0.0',
      build: '123'
    },
    campaign: {
      name: 'Spring Sale',
      source: 'email',
      medium: 'newsletter'
    },
    device: {
      type: 'server',
      name: 'api-server-1'
    }
  }
});
```

### Disable in Development

```javascript
const cairo = Cairo.init('YOUR_WRITE_KEY', {
  enable: process.env.NODE_ENV === 'production'
});
```

### Error Handling

```javascript
cairo.track('Event', { data: 'value' }, {}, (error, response) => {
  if (error) {
    console.error('Failed to track event:', error);
    // Implement fallback logic
  }
});
```

### Graceful Shutdown

Ensure all events are sent before process exit:

```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await cairo.flush();
  process.exit(0);
});
```

## Environment Variables

You can configure the SDK using environment variables:

```bash
CAIRO_WRITE_KEY=your-write-key
CAIRO_DATA_PLANE_URL=https://api.cairo.io
CAIRO_DEBUG=true
```

```javascript
const cairo = Cairo.init(
  process.env.CAIRO_WRITE_KEY || 'fallback-key',
  {
    dataPlaneUrl: process.env.CAIRO_DATA_PLANE_URL,
    debug: process.env.CAIRO_DEBUG === 'true'
  }
);
```

## Next.js Integration

For Next.js applications, initialize Cairo once:

```javascript
// lib/cairo.js
import Cairo from '@cairo/node-sdk';

let cairo;

if (!cairo) {
  cairo = Cairo.init(process.env.NEXT_PUBLIC_CAIRO_WRITE_KEY, {
    dataPlaneUrl: process.env.NEXT_PUBLIC_CAIRO_URL
  });
}

export default cairo;
```

Then use in API routes or getServerSideProps:

```javascript
// pages/api/track.js
import cairo from '../../lib/cairo';

export default async function handler(req, res) {
  const { userId, event, properties } = req.body;

  cairo.track({
    userId,
    event,
    properties
  });

  res.json({ success: true });
}
```

## Express.js Middleware

Create middleware for automatic tracking:

```javascript
const cairo = require('@cairo/node-sdk').init('YOUR_WRITE_KEY');

// Track all API requests
app.use((req, res, next) => {
  cairo.track({
    userId: req.user?.id || req.sessionID,
    event: 'API Request',
    properties: {
      path: req.path,
      method: req.method,
      ip: req.ip
    }
  });
  next();
});
```

## Debugging

Enable debug mode to see detailed logs:

```javascript
const cairo = Cairo.init('YOUR_WRITE_KEY', {
  debug: true
});
```

Debug output includes:
- SDK initialization
- Event validation
- Queue operations
- API requests and responses
- Retry attempts

## Best Practices

1. **Initialize Once**: Create a single SDK instance and reuse it
2. **User Identification**: Always identify users after authentication
3. **Event Naming**: Use consistent, descriptive event names
4. **Property Types**: Keep property types consistent across events
5. **PII Handling**: Never send passwords or sensitive data
6. **Error Handling**: Always handle errors in callbacks or use try/catch with async/await
7. **Batch Size**: Adjust `flushAt` based on your event volume
8. **Shutdown**: Call `flush()` before process termination

## Migration from Segment

Migrating from Segment's Node.js SDK is straightforward:

```javascript
// Segment
const Analytics = require('analytics-node');
const analytics = new Analytics('SEGMENT_WRITE_KEY');

// Cairo (compatible API)
const Cairo = require('@cairo/node-sdk');
const analytics = Cairo.init('CAIRO_WRITE_KEY');

// The rest of your code remains the same!
analytics.track({...});
analytics.identify({...});
```

## Support

- Documentation: [https://docs.cairo.io](https://docs.cairo.io)
- GitHub Issues: [https://github.com/cairo-cdp/cairo/issues](https://github.com/cairo-cdp/cairo/issues)
- Discord: [https://discord.gg/cairo](https://discord.gg/cairo)

## License

MIT