export class Utils {
  /**
   * Generate a random UUID-like ID
   */
  static generateId(): string {
    return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Parse campaign parameters from URL
   */
  static getCampaignParams(): Record<string, string> {
    const params = new URLSearchParams(window.location.search);
    const campaign: Record<string, string> = {};

    // UTM parameters
    if (params.get('utm_source')) campaign.source = params.get('utm_source')!;
    if (params.get('utm_medium')) campaign.medium = params.get('utm_medium')!;
    if (params.get('utm_campaign')) campaign.name = params.get('utm_campaign')!;
    if (params.get('utm_term')) campaign.term = params.get('utm_term')!;
    if (params.get('utm_content')) campaign.content = params.get('utm_content')!;

    // Alternative parameter names
    if (params.get('source')) campaign.source = params.get('source')!;
    if (params.get('medium')) campaign.medium = params.get('medium')!;
    if (params.get('campaign')) campaign.name = params.get('campaign')!;

    return campaign;
  }

  /**
   * Get a unique CSS selector for an element
   */
  static getSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).join('.');
      if (classes) {
        return `${element.tagName.toLowerCase()}.${classes}`;
      }
    }

    // Fallback to tag name with nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${element.tagName.toLowerCase()}:nth-child(${index})`;
    }

    return element.tagName.toLowerCase();
  }

  /**
   * Throttle function calls
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | undefined;
    let previous = 0;

    return function (...args: Parameters<T>) {
      const now = Date.now();

      if (!previous || now - previous > wait) {
        previous = now;
        func.apply(this, args);
      } else if (!timeout) {
        timeout = window.setTimeout(() => {
          previous = Date.now();
          timeout = undefined;
          func.apply(this, args);
        }, wait - (now - previous));
      }
    };
  }

  /**
   * Debounce function calls
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | undefined;

    return function (...args: Parameters<T>) {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Deep merge objects
   */
  static merge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) return target;

    const source = sources.shift();
    if (!source) return target;

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {} as any;
        this.merge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        target[key] = source[key] as any;
      }
    }

    return this.merge(target, ...sources);
  }

  /**
   * Check if code is running in browser environment
   */
  static isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * Get browser information
   */
  static getBrowserInfo(): { name: string; version: string } {
    const ua = navigator.userAgent;

    if (ua.includes('Chrome')) {
      const version = ua.match(/Chrome\/(\d+)/)?.[1] || 'unknown';
      return { name: 'Chrome', version };
    }

    if (ua.includes('Firefox')) {
      const version = ua.match(/Firefox\/(\d+)/)?.[1] || 'unknown';
      return { name: 'Firefox', version };
    }

    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      const version = ua.match(/Version\/(\d+)/)?.[1] || 'unknown';
      return { name: 'Safari', version };
    }

    if (ua.includes('Edge')) {
      const version = ua.match(/Edge\/(\d+)/)?.[1] || 'unknown';
      return { name: 'Edge', version };
    }

    return { name: 'Unknown', version: 'unknown' };
  }

  /**
   * Get device type
   */
  static getDeviceType(): string {
    const ua = navigator.userAgent;

    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      return 'tablet';
    }

    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
      return 'mobile';
    }

    return 'desktop';
  }

  /**
   * Check if user prefers reduced motion
   */
  static prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Get page load state
   */
  static getPageLoadState(): string {
    return document.readyState; // 'loading', 'interactive', or 'complete'
  }

  /**
   * Wait for DOM to be ready
   */
  static onReady(callback: () => void): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  /**
   * Safely get nested object property
   */
  static get(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return defaultValue;
      }
    }

    return result;
  }

  /**
   * Remove PII from properties
   */
  static sanitizePII(properties: Record<string, any>): Record<string, any> {
    const piiFields = [
      'password',
      'ssn',
      'social_security_number',
      'credit_card',
      'card_number',
      'cvv',
      'pin',
    ];

    const sanitized = { ...properties };

    for (const field of piiFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}