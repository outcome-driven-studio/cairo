import { useState, useEffect } from 'react';
import {
  useCairo,
  usePageView,
  TrackClick,
  TrackForm,
  TrackView,
  UserIdentifier,
  useExperiment,
} from '@cairo/react';

export default function HomePage() {
  const { track, identify, ready, user } = useCairo();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [experimentVariant] = useState(() =>
    Math.random() > 0.5 ? 'variant_a' : 'variant_b'
  );

  // Track page view with custom properties
  usePageView('Homepage', 'Home', {
    section: 'landing',
    experiment_variant: experimentVariant,
  });

  // A/B test experiment
  const { trackConversion } = useExperiment('homepage_cta', experimentVariant);

  useEffect(() => {
    if (ready) {
      track('App Loaded', {
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
      });
    }
  }, [ready, track]);

  const handleLogin = () => {
    const user = {
      id: 'demo-user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      plan: 'pro',
      company: 'Demo Corp',
    };

    identify(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan,
      company: user.company,
      loginMethod: 'demo',
    });

    setCurrentUser(user);

    track('User Logged In', {
      method: 'demo',
      userId: user.id,
    });
  };

  const handlePurchase = () => {
    track('Purchase Completed', {
      orderId: 'ORD-' + Math.random().toString(36).substr(2, 9),
      revenue: 99.99,
      currency: 'USD',
      products: ['cairo-pro'],
      paymentMethod: 'credit_card',
    });

    // Track experiment conversion
    trackConversion('Purchase', { value: 99.99 });
  };

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    track('Newsletter Signup', {
      email: formData.get('email'),
      source: 'homepage',
    });
  };

  if (!ready) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Loading Cairo Analytics...</h1>
        <p>Initializing tracking...</p>
      </div>
    );
  }

  return (
    <UserIdentifier
      userId={currentUser?.id}
      traits={currentUser ? {
        email: currentUser.email,
        name: currentUser.name,
        plan: currentUser.plan,
      } : undefined}
    >
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <header style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1>🚀 Cairo CDP Demo</h1>
          <p>Demonstrating React SDK event tracking</p>
          {user.userId && (
            <p style={{ color: 'green' }}>
              ✅ Identified as: {user.userId} ({user.traits.email})
            </p>
          )}
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

          {/* User Actions Section */}
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
            <h2>👤 User Actions</h2>

            {!currentUser ? (
              <TrackClick
                event="Login Button Clicked"
                properties={{ location: 'demo_section' }}
                onClick={handleLogin}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#007cba',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Login (Demo)
              </TrackClick>
            ) : (
              <div>
                <p>Welcome, {currentUser.name}!</p>
                <TrackClick
                  event="Purchase Button Clicked"
                  properties={{
                    product: 'cairo-pro',
                    price: 99.99,
                    experiment_variant: experimentVariant,
                  }}
                  onClick={handlePurchase}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginRight: '10px',
                  }}
                >
                  {experimentVariant === 'variant_a' ? 'Buy Now - $99.99' : 'Get Cairo Pro - $99.99'}
                </TrackClick>
              </div>
            )}
          </section>

          {/* Form Tracking Section */}
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
            <h2>📧 Newsletter Signup</h2>

            <TrackForm
              event="Newsletter Form Interacted"
              trackFields={true}
              submitEvent="Newsletter Submitted"
              onSubmit={handleNewsletterSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <input
                name="email"
                type="email"
                placeholder="Enter your email"
                required
                style={{
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Subscribe
              </button>
            </TrackForm>
          </section>

          {/* View Tracking Section */}
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
            <h2>👁️ View Tracking</h2>

            <TrackView
              event="Special Offer Viewed"
              properties={{
                offer_type: 'discount',
                discount_percent: 20,
              }}
              threshold={0.8}
              style={{
                padding: '20px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeeba',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              <h3>🎉 Special Offer!</h3>
              <p>20% off your first purchase</p>
              <small>(This view is being tracked when 80% visible)</small>
            </TrackView>
          </section>

          {/* Manual Tracking Section */}
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
            <h2>🔘 Manual Tracking</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => track('Feature Explored', {
                  feature: 'analytics',
                  timestamp: new Date().toISOString(),
                })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Track "Feature Explored"
              </button>

              <button
                onClick={() => track('Help Requested', {
                  section: 'demo',
                  helpType: 'button_click',
                })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Track "Help Requested"
              </button>

              <button
                onClick={() => track('Custom Event', {
                  customProperty: 'custom_value',
                  eventId: Math.random().toString(36).substr(2, 9),
                  metadata: {
                    browser: navigator.userAgent,
                    timestamp: Date.now(),
                  }
                })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Track Custom Event
              </button>
            </div>
          </section>

          {/* Current State Section */}
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
            <h2>📊 Current State</h2>

            <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
              <p><strong>Ready:</strong> {ready ? '✅' : '❌'}</p>
              <p><strong>User ID:</strong> {user.userId || 'Not set'}</p>
              <p><strong>Anonymous ID:</strong> {user.anonymousId?.substring(0, 8)}...</p>
              <p><strong>Experiment:</strong> {experimentVariant}</p>
              <p><strong>Traits:</strong></p>
              <pre style={{
                backgroundColor: '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
              }}>
                {JSON.stringify(user.traits, null, 2)}
              </pre>
            </div>
          </section>
        </div>

        <footer style={{ marginTop: '40px', textAlign: 'center', color: '#666' }}>
          <p>
            This demo shows various Cairo React SDK features. Check your browser's
            developer console and Cairo server logs to see the events being tracked.
          </p>
          <p>
            <strong>Events tracked:</strong> Page views, clicks, form submissions,
            element visibility, user identification, and custom events.
          </p>
        </footer>
      </div>
    </UserIdentifier>
  );
}