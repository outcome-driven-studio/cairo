/**
 * Cairo Analytics Snippet
 *
 * This is the minimal loader that gets embedded in web pages.
 * It creates a queue for early tracking calls and loads the full SDK asynchronously.
 */

declare global {
  interface Window {
    cairo?: any[];
  }
}

(function() {
  // Create the analytics queue if it doesn't exist
  window.cairo = window.cairo || [];

  // If the SDK is already loaded, don't run the snippet again
  if (typeof window.cairo.track === 'function') {
    return;
  }

  // Method names that should be queued
  const methods = [
    'track',
    'identify',
    'page',
    'group',
    'alias',
    'ready',
    'reset',
    'debug'
  ];

  // Create stub methods that queue calls
  methods.forEach(method => {
    window.cairo[method] = function() {
      window.cairo.push([method, ...arguments]);
    };
  });

  // Load the full SDK asynchronously
  window.cairo.load = function(writeKey: string, config: any = {}) {
    // Store the load call in the queue
    window.cairo.push(['load', writeKey, config]);

    // Create script tag to load the full SDK
    const script = document.createElement('script');
    script.async = true;
    script.src = config.cdnUrl || 'https://cdn.cairo.io/cairo.min.js';

    // Insert the script
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  };

  // User and consent methods
  window.cairo.user = function() {
    return {
      anonymousId: () => null,
      id: () => null,
      traits: () => ({}),
    };
  };

  window.cairo.consent = {
    granted: () => true,
    categories: () => [],
    grant: (categories?: string[]) => {
      window.cairo.push(['consent.grant', categories]);
    },
    revoke: (categories?: string[]) => {
      window.cairo.push(['consent.revoke', categories]);
    },
  };
})();