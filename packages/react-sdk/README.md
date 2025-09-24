# @cairo/react

Official React SDK for Cairo CDP - Track events, identify users, and build analytics into your React and Next.js applications.

## Installation

```bash
npm install @cairo/react
# or
yarn add @cairo/react
# or
pnpm add @cairo/react
```

## Quick Start

### 1. Wrap Your App with CairoProvider

```jsx
import { CairoProvider } from '@cairo/react';

function App() {
  return (
    <CairoProvider
      writeKey="YOUR_WRITE_KEY"
      config={{
        dataPlaneUrl: 'https://api.your-cairo-instance.com',
        autoTrack: {
          pageViews: true,
          clicks: false,
          formSubmissions: true,
        }
      }}
    >
      <YourApp />
    </CairoProvider>
  );
}
```

### 2. Use the Hook in Components

```jsx
import { useCairo } from '@cairo/react';

function ProductPage() {
  const { track, identify, ready } = useCairo();

  const handlePurchase = () => {
    track('Product Purchased', {
      productId: 'PRO-001',
      price: 99.99,
      currency: 'USD'
    });
  };

  const handleLogin = (user) => {
    identify(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan
    });
  };

  if (!ready) return <div>Loading analytics...</div>;

  return (
    <div>
      <button onClick={handlePurchase}>Buy Now</button>
      <button onClick={() => handleLogin(user)}>Login</button>
    </div>
  );
}
```

## Configuration Options

```jsx
<CairoProvider
  writeKey="YOUR_WRITE_KEY"
  config={{
    // Server configuration
    dataPlaneUrl: 'https://api.cairo.io',
    flushAt: 20,              // Batch size
    flushInterval: 10000,     // Batch interval (ms)
    debug: true,              // Enable debug logging

    // Auto-tracking features
    autoTrack: {
      pageViews: true,        // Auto track page views
      clicks: false,          // Auto track clicks on buttons/links
      formSubmissions: true,  // Auto track form submissions
      performance: false,     // Auto track page performance
    },

    // Consent management
    consent: {
      required: false,        // Require consent before tracking
      categories: ['analytics', 'marketing'],
    },

    // Initial user data
    user: {
      userId: 'user123',
      anonymousId: 'anon456',
      traits: {
        email: 'user@example.com'
      }
    }
  }}
>
```

## Hooks

### useCairo()

The main hook for tracking events:

```jsx
const { track, identify, page, group, alias, ready, user, consent, reset } = useCairo();

// Track custom events
track('Button Clicked', { button: 'signup' });

// Identify users
identify('user123', { email: 'user@example.com', plan: 'pro' });

// Track page views
page('Product', 'iPhone 15', { category: 'Electronics' });

// Associate with groups
group('company123', { name: 'Acme Corp', plan: 'enterprise' });

// Create aliases
alias('user123', 'anonymous456');

// Check if ready
if (ready) {
  track('App Loaded');
}

// Access user info
console.log(user.userId, user.traits);

// Manage consent
if (!consent.granted) {
  consent.grant(['analytics']);
}

// Reset user data
reset();
```

### usePageView()

Auto-track page views when components mount:

```jsx
import { usePageView } from '@cairo/react';

function ProductDetail({ productId }) {
  // Tracks page view automatically
  usePageView('Product', 'Product Detail', {
    productId,
    category: 'Electronics'
  });

  return <div>Product details...</div>;
}
```

### useTrackEvent()

Track events on component lifecycle:

```jsx
import { useTrackEvent } from '@cairo/react';

function Timer() {
  // Track when timer starts and stops
  useTrackEvent('Timer Started', { duration: 60 }, {
    onMount: true,
    onUnmount: true  // Will track "Timer Started Ended"
  });

  return <div>Timer running...</div>;
}
```

### useAutoTrack()

Track interactions with specific elements:

```jsx
import { useAutoTrack } from '@cairo/react';

function Button() {
  const buttonRef = useAutoTrack({
    event: 'CTA Clicked',
    properties: { location: 'header' },
    category: 'engagement'
  });

  return <button ref={buttonRef}>Sign Up</button>;
}
```

### useFormTracking()

Track form submissions and field changes:

```jsx
import { useFormTracking } from '@cairo/react';

function ContactForm() {
  const formRef = useRef();

  useFormTracking(formRef, {
    trackSubmit: true,
    trackFieldChanges: true,
    submitEvent: 'Contact Form Submitted'
  });

  return (
    <form ref={formRef}>
      <input name="email" type="email" />
      <input name="message" type="text" />
      <button type="submit">Send</button>
    </form>
  );
}
```

### useExperiment()

Track A/B testing experiments:

```jsx
import { useExperiment } from '@cairo/react';

function FeatureFlag({ variant }) {
  const { trackConversion } = useExperiment('checkout_flow', variant);

  const handleConvert = () => {
    trackConversion('Purchase Completed', { value: 99.99 });
  };

  return variant === 'A' ? <ButtonA /> : <ButtonB />;
}
```

### usePerformanceTracking()

Track page performance metrics:

```jsx
import { usePerformanceTracking } from '@cairo/react';

function App() {
  const { trackTiming } = usePerformanceTracking({
    trackPageLoad: true,
    trackNavigation: true
  });

  const handleApiCall = async () => {
    const start = performance.now();
    await fetchData();
    trackTiming('API Call', start);
  };
}
```

## Components

### TrackClick

Automatically track clicks:

```jsx
import { TrackClick } from '@cairo/react';

<TrackClick
  event="CTA Clicked"
  properties={{ location: 'hero', variant: 'blue' }}
  element="button"
>
  Sign Up Now
</TrackClick>
```

### TrackLink

Track link clicks with link-specific data:

```jsx
import { TrackLink } from '@cairo/react';

<TrackLink
  href="/pricing"
  event="Pricing Link Clicked"
  properties={{ location: 'navbar' }}
>
  View Pricing
</TrackLink>
```

### TrackForm

Track form interactions:

```jsx
import { TrackForm } from '@cairo/react';

<TrackForm
  event="Newsletter Signup"
  trackFields={true}
  submitEvent="Newsletter Form Submitted"
>
  <input name="email" type="email" />
  <button type="submit">Subscribe</button>
</TrackForm>
```

### TrackView

Track when elements come into view:

```jsx
import { TrackView } from '@cairo/react';

<TrackView
  event="Product Viewed"
  properties={{ productId: 'PRO-001' }}
  threshold={0.5}
  triggerOnce={true}
>
  <ProductCard />
</TrackView>
```

### UserIdentifier

Auto-identify users when data is available:

```jsx
import { UserIdentifier } from '@cairo/react';

function App({ user }) {
  return (
    <UserIdentifier
      userId={user?.id}
      traits={{
        email: user?.email,
        name: user?.name,
        plan: user?.plan
      }}
    >
      <Dashboard />
    </UserIdentifier>
  );
}
```

### ExperimentTracker

Track A/B test exposure:

```jsx
import { ExperimentTracker } from '@cairo/react';

<ExperimentTracker
  experimentName="checkout_flow"
  variant="variant_a"
>
  <CheckoutButton />
</ExperimentTracker>
```

### TimingTracker

Measure time spent in components:

```jsx
import { TimingTracker } from '@cairo/react';

<TimingTracker
  name="product_page_time"
  properties={{ productId: 'PRO-001' }}
>
  <ProductPage />
</TimingTracker>
```

## Next.js Integration

### App Router (app/)

```jsx
// app/providers.jsx
'use client';
import { CairoProvider } from '@cairo/react';

export function Providers({ children }) {
  return (
    <CairoProvider writeKey={process.env.NEXT_PUBLIC_CAIRO_WRITE_KEY}>
      {children}
    </CairoProvider>
  );
}

// app/layout.jsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Pages Router (pages/)

```jsx
// pages/_app.js
import { CairoProvider } from '@cairo/react';

export default function App({ Component, pageProps }) {
  return (
    <CairoProvider writeKey={process.env.NEXT_PUBLIC_CAIRO_WRITE_KEY}>
      <Component {...pageProps} />
    </CairoProvider>
  );
}
```

### Server-Side Events

For server-side tracking, use the Node.js SDK:

```jsx
// pages/api/track.js
import { Cairo } from '@cairo/node-sdk';

const cairo = Cairo.init(process.env.CAIRO_WRITE_KEY);

export default function handler(req, res) {
  const { event, properties, userId } = req.body;

  cairo.track({ userId, event, properties });

  res.json({ success: true });
}
```

## TypeScript Support

Full TypeScript support is included:

```tsx
import { useCairo, TrackMessage } from '@cairo/react';

function TypedComponent() {
  const { track } = useCairo();

  const handleClick = () => {
    const event: TrackMessage = {
      userId: 'user123',
      event: 'Button Clicked',
      properties: {
        buttonText: 'Click me',
        location: 'header'
      }
    };

    track(event);
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

## Consent Management

Handle GDPR/CCPA compliance:

```jsx
function ConsentBanner() {
  const { consent } = useCairo();

  if (consent.granted) return null;

  return (
    <div>
      <p>We use cookies to improve your experience.</p>
      <button onClick={() => consent.grant(['analytics'])}>
        Accept Analytics
      </button>
      <button onClick={() => consent.grant(['analytics', 'marketing'])}>
        Accept All
      </button>
      <button onClick={() => consent.revoke()}>
        Deny
      </button>
    </div>
  );
}
```

## Debugging

Enable debug mode to see detailed logs:

```jsx
<CairoProvider
  writeKey="YOUR_KEY"
  config={{ debug: true }}
>
```

Debug output includes:
- Event tracking
- User identification
- Page views
- Batch sends
- Error messages

## Best Practices

### 1. Initialize Early

Place `CairoProvider` as high as possible in your component tree:

```jsx
// ✅ Good
<CairoProvider>
  <App />
</CairoProvider>

// ❌ Bad - too deep
<App>
  <Dashboard>
    <CairoProvider>
      <Analytics />
    </CairoProvider>
  </Dashboard>
</App>
```

### 2. Use Meaningful Event Names

```jsx
// ✅ Good
track('Product Added to Cart', { productId: '123' });
track('Checkout Started', { cartValue: 99.99 });

// ❌ Bad
track('click', { button: 'add' });
track('event1', { data: '123' });
```

### 3. Identify Users Early

```jsx
// ✅ Good - identify immediately after login
const handleLogin = async (credentials) => {
  const user = await login(credentials);
  identify(user.id, user.profile);
};

// ❌ Bad - identify much later
useEffect(() => {
  if (user && hasLoadedProfile) {
    identify(user.id, user.profile);
  }
}, [user, hasLoadedProfile]);
```

### 4. Use Auto-tracking Wisely

```jsx
// ✅ Good - selective auto-tracking
<CairoProvider config={{
  autoTrack: {
    pageViews: true,      // Usually helpful
    formSubmissions: true, // Great for conversions
    clicks: false,        // Can be noisy
  }
}}>
```

### 5. Handle Loading States

```jsx
function Analytics() {
  const { track, ready } = useCairo();

  if (!ready) {
    return <div>Loading analytics...</div>;
  }

  return <AnalyticsDashboard />;
}
```

## Migration from Segment

The API is compatible with Segment's Analytics.js:

```jsx
// Segment
import { Analytics } from '@segment/analytics-node';
const analytics = new Analytics({ writeKey: 'KEY' });

// Cairo (similar API)
import { useCairo } from '@cairo/react';
const { track, identify, page } = useCairo();

// Same method calls work!
track('Event', { property: 'value' });
identify('userId', { trait: 'value' });
```

## Examples

Check out complete examples:

- [Basic React App](./examples/react-basic)
- [Next.js App Router](./examples/nextjs-app-router)
- [Next.js Pages Router](./examples/nextjs-pages)
- [E-commerce Store](./examples/ecommerce)
- [SaaS Dashboard](./examples/saas-dashboard)

## Support

- Documentation: [https://docs.cairo.io](https://docs.cairo.io)
- GitHub Issues: [https://github.com/cairo-cdp/cairo/issues](https://github.com/cairo-cdp/cairo/issues)
- Discord: [https://discord.gg/cairo](https://discord.gg/cairo)

## License

MIT