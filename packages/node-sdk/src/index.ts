import { CairoClient, createClient, getClient } from './client';
import { EventQueue } from './queue';
import { EventValidator } from './validator';

// Re-export types
export * from './types';

// Re-export classes
export { CairoClient, EventQueue, EventValidator };

// Main SDK class
export class Cairo extends CairoClient {
  private static instance: Cairo | null = null;

  /**
   * Initialize the Cairo SDK
   */
  static init(writeKey: string, options: any = {}): Cairo {
    if (this.instance) {
      console.warn('[Cairo SDK] Already initialized. Returning existing instance.');
      return this.instance;
    }

    this.instance = new Cairo({
      writeKey,
      ...options,
    });

    return this.instance;
  }

  /**
   * Get the current instance
   */
  static getInstance(): Cairo | null {
    return this.instance;
  }
}

// Default export for convenience
export default Cairo;

// CommonJS compatibility
module.exports = Cairo;
module.exports.Cairo = Cairo;
module.exports.default = Cairo;