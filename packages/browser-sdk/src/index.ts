import { CairoBrowserAnalytics } from './analytics';
import { CairoBrowserConfig, CairoAnalytics } from './types';
import { Utils } from './utils';

// Re-export types
export * from './types';

// Main initialization function
export function load(writeKey: string, config: Partial<CairoBrowserConfig> = {}): CairoAnalytics {
  if (!Utils.isBrowser()) {
    throw new Error('Cairo browser SDK can only be used in browser environments');
  }

  const fullConfig: CairoBrowserConfig = {
    writeKey,
    ...config,
  };

  return new CairoBrowserAnalytics(fullConfig);
}

// Global snippet support
declare global {
  interface Window {
    cairo?: CairoAnalytics | any[];
  }
}

// Auto-initialize if snippet is detected
if (typeof window !== 'undefined' && Array.isArray(window.cairo)) {
  // Find the load call in the queue
  const loadCall = window.cairo.find(call => Array.isArray(call) && call[0] === 'load');

  if (loadCall) {
    const [, writeKey, config] = loadCall;
    window.cairo = load(writeKey, config || {});
  }
}

// Default export
export default { load };