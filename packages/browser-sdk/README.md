# @cairo/browser

Universal JavaScript SDK for Cairo CDP - Track events from any website with a simple script tag.

## Installation

### Option 1: Script Tag (Recommended)

Add this snippet to your website's `<head>` section:

```html
<script>
  !function(){var analytics=window.cairo=window.cairo||[];if(!analytics.initialize)if(analytics.invoked)window.console&&console.error&&console.error("Cairo snippet included twice.");else{analytics.invoked=!0;analytics.methods=["track","identify","page","group","alias","ready","reset","debug"];analytics.factory=function(e){return function(){var t=Array.prototype.slice.call(arguments);t.unshift(e);analytics.push(t);return analytics}};for(var e=0;e<analytics.methods.length;e++){var key=analytics.methods[e];analytics[key]=analytics.factory(key)}analytics.load=function(key,e){var t=document.createElement("script");t.type="text/javascript";t.async=!0;t.src="https://cdn.cairo.io/cairo.min.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n);analytics._writeKey=key;analytics._config=e||{}};analytics.SNIPPET_VERSION="1.0.0";
  cairo.load("YOUR_WRITE_KEY", {
    // Optional configuration
    dataPlaneUrl: "https://api.your-cairo-instance.com"
  });
  }}();
</script>
```

### Option 2: NPM Package

```bash
npm install @cairo/browser
```

```javascript
import { load } from '@cairo/browser';

const cairo = load('YOUR_WRITE_KEY', {
  dataPlaneUrl: 'https://api.your-cairo-instance.com'
});
```

### Option 3: CDN

```html
<script src="https://cdn.cairo.io/cairo.min.js"></script>
<script>
  const cairo = Cairo.load('YOUR_WRITE_KEY');
</script>
```

## Quick Start

Once loaded, track events anywhere on your site:

```javascript
// Track events
cairo.track('Button Clicked', {
  button: 'signup',
  location: 'header'
});

// Identify users
cairo.identify('user123', {
  email: 'user@example.com',
  name: 'John Doe',
  plan: 'premium'
});

// Track page views
cairo.page('Homepage', {
  section: 'landing'
});
```

## Configuration

### Full Configuration Options

```javascript
cairo.load('YOUR_WRITE_KEY', {
  // Server configuration
  dataPlaneUrl: 'https://api.cairo.io',  // Your Cairo server
  flushAt: 20,              // Events to batch before sending
  flushInterval: 10000,     // Time between flushes (ms)
  timeout: 10000,           // Request timeout (ms)
  maxRetries: 3,            // Max retry attempts
  debug: false,             // Enable debug logging

  // Cookie settings
  cookieDomain: '.example.com',  // Set cookie domain
  cookieSecure: true,            // Secure cookies only
  crossDomainTracking: false,    // Enable cross-domain tracking

  // Auto-tracking
  autoTrack: {
    pageViews: true,        // Auto track page views
    clicks: false,          // Auto track clicks
    formSubmissions: false, // Auto track form submissions
    scrollDepth: false,     // Track scroll milestones
    performance: false,     // Track page performance
    errors: false,          // Track JavaScript errors
  },

  // Consent management
  consent: {
    required: false,        // Require consent before tracking
    defaultCategories: [],  // Default consent categories
  },

  // Integration settings
  integrations: {
    'All': true,           // Enable all integrations by default
    'Mixpanel': false,     // Disable specific integration
  }
});
```

## API Reference

### track()

Track custom events:

```javascript
// Simple usage
cairo.track('Product Viewed', {
  productId: 'PRO-001',
  productName: 'Cairo Pro',
  price: 99.99,
  category: 'Software'
});

// With user context
cairo.track('Purchase Completed', {
  orderId: 'ORD-123',
  revenue: 299.99,
  products: ['PRO-001', 'PRO-002']
});

// With callback
cairo.track('Event Name', { key: 'value' }, function(err) {
  if (err) console.error('Track failed:', err);
});
```

### identify()

Identify users and set their traits:

```javascript
// Basic identification
cairo.identify('user123', {
  email: 'user@example.com',
  name: 'John Doe',
  createdAt: new Date('2024-01-01'),
  plan: 'premium'
});

// Company information
cairo.identify('user123', {
  email: 'user@example.com',
  company: {
    name: 'Acme Corp',
    size: 100,
    industry: 'Technology'
  }
});
```

### page()

Track page views:

```javascript
// Simple page view
cairo.page();

// Named page
cairo.page('Product Detail', {
  productId: 'PRO-001',
  category: 'Electronics'
});

// With category
cairo.page('Shop', 'Product Detail', {
  productId: 'PRO-001'
});
```

### group()

Associate users with groups/organizations:

```javascript
cairo.group('company123', {
  name: 'Acme Corporation',
  plan: 'enterprise',
  employees: 500,
  industry: 'Technology'
});
```

### alias()

Link user identities:

```javascript
cairo.alias('user123', 'anonymous456');
```

### ready()

Execute code when Cairo is fully loaded:

```javascript
cairo.ready(function() {
  console.log('Cairo is ready!');
  cairo.track('App Loaded');
});
```

### user()

Access current user information:

```javascript
console.log('User ID:', cairo.id());
console.log('Anonymous ID:', cairo.anonymousId());
console.log('Traits:', cairo.traits());

// Or use the user object
const user = cairo.user();
console.log('User ID:', user.id());
console.log('Anonymous ID:', user.anonymousId());
console.log('Traits:', user.traits());
```

### reset()

Clear user data:

```javascript
cairo.reset(); // Clears user ID, traits, generates new anonymous ID
```

### debug()

Toggle debug mode:

```javascript
cairo.debug(true);  // Enable debug logging
cairo.debug(false); // Disable debug logging
console.log('Debug enabled:', cairo.debug()); // Get current state
```

## Auto-tracking Features

### Page Views

Automatically track page views including SPA navigation:

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    pageViews: true
  }
});
```

### Click Tracking

Track clicks on buttons, links, and elements with `data-track` attributes:

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    clicks: true
  }
});
```

```html
<!-- Will be automatically tracked -->
<button>Sign Up</button>
<a href="/pricing">View Pricing</a>

<!-- Custom tracking -->
<div data-track data-track-event="Custom Click">Click me</div>
```

### Form Submissions

Track form submissions with field information:

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    formSubmissions: true
  }
});
```

### Scroll Depth

Track scroll milestones (25%, 50%, 75%, 100%):

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    scrollDepth: true
  }
});
```

### Performance Tracking

Track page load performance metrics:

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    performance: true
  }
});
```

### Error Tracking

Track JavaScript errors and unhandled promise rejections:

```javascript
cairo.load('YOUR_KEY', {
  autoTrack: {
    errors: true
  }
});
```

## Consent Management

Handle GDPR/CCPA compliance:

```javascript
// Check consent status
if (!cairo.consent.granted()) {
  // Show consent banner
  showConsentBanner();
}

// Grant consent
cairo.consent.grant(['analytics', 'marketing']);

// Revoke consent
cairo.consent.revoke(['marketing']); // Revoke specific categories
cairo.consent.revoke(); // Revoke all

// Check granted categories
console.log('Granted categories:', cairo.consent.categories());
```

### Consent-aware Configuration

```javascript
cairo.load('YOUR_KEY', {
  consent: {
    required: true,           // Don't track until consent is granted
    defaultCategories: ['analytics'], // Categories to grant by default
  }
});
```

## Advanced Usage

### Custom Context

Add custom context to all events:

```javascript
cairo.ready(function() {
  // This context will be added to all subsequent events
  cairo._context = {
    app: {
      name: 'My App',
      version: '1.0.0'
    },
    campaign: {
      name: 'Holiday Sale',
      source: 'email'
    }
  };
});
```

### Integration Control

Disable specific integrations:

```javascript
cairo.track('Event', { key: 'value' }, {
  integrations: {
    'Mixpanel': false,  // Don't send to Mixpanel
    'Slack': true       // Send to Slack
  }
});
```

### Cross-Domain Tracking

Track users across multiple domains:

```javascript
cairo.load('YOUR_KEY', {
  crossDomainTracking: true,
  cookieDomain: '.example.com'  // Set for *.example.com
});
```

### Single Page Applications

Cairo automatically handles SPA navigation, but you can manually track route changes:

```javascript
// React Router example
function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    cairo.page(location.pathname);
  }, [location.pathname]);
}

// Vue Router example
router.afterEach((to) => {
  cairo.page(to.name, {
    path: to.path,
    query: to.query
  });
});
```

## TypeScript Support

The SDK includes full TypeScript definitions:

```typescript
import { load, CairoAnalytics, TrackMessage } from '@cairo/browser';

const cairo: CairoAnalytics = load('YOUR_KEY');

const event: TrackMessage = {
  event: 'Product Purchased',
  properties: {
    productId: 'PRO-001',
    price: 99.99
  },
  userId: 'user123'
};

cairo.track(event);
```

## Debugging

Enable debug mode to see detailed logs:

```javascript
cairo.load('YOUR_KEY', { debug: true });
// or
cairo.debug(true);
```

Debug logs include:
- SDK initialization
- Event tracking
- API requests/responses
- Queue management
- Error messages

Open browser DevTools Console to see debug output.

## Examples

### E-commerce Store

```javascript
// Product page
cairo.page('Product', 'iPhone 15', {
  category: 'Electronics',
  brand: 'Apple',
  price: 999
});

// Add to cart
cairo.track('Product Added', {
  productId: 'iphone-15',
  productName: 'iPhone 15',
  category: 'Electronics',
  price: 999,
  quantity: 1
});

// Purchase
cairo.track('Order Completed', {
  orderId: 'ORD-123',
  revenue: 999,
  tax: 89.91,
  shipping: 0,
  products: [{
    productId: 'iphone-15',
    sku: 'APL-IPH-15-128',
    name: 'iPhone 15 128GB',
    category: 'Electronics',
    price: 999,
    quantity: 1
  }]
});
```

### SaaS Application

```javascript
// User signup
cairo.identify('user123', {
  email: 'user@startup.com',
  name: 'Jane Smith',
  plan: 'free',
  source: 'organic'
});

// Feature usage
cairo.track('Feature Used', {
  feature: 'dashboard',
  plan: 'free',
  usage_count: 1
});

// Upgrade
cairo.track('Plan Upgraded', {
  previous_plan: 'free',
  new_plan: 'pro',
  billing_cycle: 'monthly',
  amount: 29.99
});
```

### Content Site

```javascript
// Article page
cairo.page('Blog', 'How to Build a CDP', {
  category: 'Engineering',
  author: 'John Doe',
  word_count: 2500,
  reading_time: 10
});

// Newsletter signup
cairo.track('Newsletter Subscribed', {
  location: 'article_end',
  article: 'how-to-build-cdp'
});
```

## Performance

The Cairo browser SDK is optimized for performance:

- **Small bundle size**: ~15KB gzipped
- **Asynchronous loading**: Doesn't block page rendering
- **Smart batching**: Reduces network requests
- **Local caching**: Stores user data locally
- **Error resilience**: Continues working if API is down

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+
- iOS Safari 11+
- Android Chrome 81+

## Migration from Segment

The API is largely compatible with Segment's Analytics.js:

```javascript
// Segment
analytics.track('Event', { property: 'value' });
analytics.identify('userId', { trait: 'value' });
analytics.page('Page');

// Cairo (same API!)
cairo.track('Event', { property: 'value' });
cairo.identify('userId', { trait: 'value' });
cairo.page('Page');
```

Key differences:
- Load function: `cairo.load()` vs `analytics.load()`
- Configuration options may differ
- Some Segment-specific features not included

## CDN Hosting

For production use, host the SDK files on your own CDN:

1. Download the built files from `/dist`
2. Upload to your CDN
3. Update the snippet to use your CDN URL

```javascript
cairo.load('YOUR_KEY', {
  cdnUrl: 'https://your-cdn.com/cairo.min.js'
});
```

## Support

- Documentation: [https://docs.cairo.io](https://docs.cairo.io)
- GitHub Issues: [https://github.com/cairo-cdp/cairo/issues](https://github.com/cairo-cdp/cairo/issues)
- Discord: [https://discord.gg/cairo](https://discord.gg/cairo)

## License

MIT