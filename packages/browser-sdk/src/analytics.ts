import { CairoBrowserConfig, CairoAnalytics, TrackMessage, IdentifyMessage, PageMessage, GroupMessage, AliasMessage, Message, Callback, Context } from './types';
import { Queue } from './queue';
import { Storage } from './storage';
import { Utils } from './utils';

declare global {
  interface Window {
    cairo?: CairoAnalytics | any[];
  }
}

export class CairoBrowserAnalytics implements CairoAnalytics {
  private config: Required<CairoBrowserConfig>;
  private queue: Queue;
  private storage: Storage;
  private readyCallbacks: Array<() => void> = [];
  private isReady = false;
  private userId: string | null = null;
  private traits: Record<string, any> = {};
  private anonymousId: string;
  private consentGranted = true;
  private consentCategories: string[] = [];

  constructor(config: CairoBrowserConfig) {
    this.config = {
      writeKey: config.writeKey,
      dataPlaneUrl: config.dataPlaneUrl || 'https://api.cairo.io',
      flushAt: config.flushAt || 20,
      flushInterval: config.flushInterval || 10000,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 10000,
      debug: config.debug || false,
      enable: config.enable !== false,
      cookieDomain: config.cookieDomain || '',
      cookieSecure: config.cookieSecure !== false,
      crossDomainTracking: config.crossDomainTracking || false,
      autoTrack: {
        pageViews: config.autoTrack?.pageViews !== false,
        clicks: config.autoTrack?.clicks || false,
        formSubmissions: config.autoTrack?.formSubmissions || false,
        scrollDepth: config.autoTrack?.scrollDepth || false,
        performance: config.autoTrack?.performance || false,
        errors: config.autoTrack?.errors || false,
      },
      consent: {
        required: config.consent?.required || false,
        defaultCategories: config.consent?.defaultCategories || [],
      },
      integrations: config.integrations || {},
    };

    this.storage = new Storage(this.config.cookieDomain, this.config.cookieSecure);
    this.queue = new Queue(this.config);

    // Initialize IDs
    this.anonymousId = this.storage.getAnonymousId();
    this.userId = this.storage.getUserId();
    this.traits = this.storage.getTraits();

    // Initialize consent
    if (this.config.consent.required) {
      const consent = this.storage.getConsent();
      this.consentGranted = consent.granted;
      this.consentCategories = consent.categories;
    }

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Set up auto-tracking
      if (this.config.autoTrack.pageViews) {
        this.setupPageTracking();
      }

      if (this.config.autoTrack.clicks) {
        this.setupClickTracking();
      }

      if (this.config.autoTrack.formSubmissions) {
        this.setupFormTracking();
      }

      if (this.config.autoTrack.scrollDepth) {
        this.setupScrollTracking();
      }

      if (this.config.autoTrack.performance) {
        this.setupPerformanceTracking();
      }

      if (this.config.autoTrack.errors) {
        this.setupErrorTracking();
      }

      // Process any queued calls from snippet
      this.processQueuedCalls();

      this.isReady = true;
      this.readyCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          if (this.config.debug) {
            console.error('[Cairo] Error in ready callback:', error);
          }
        }
      });

      if (this.config.debug) {
        console.log('[Cairo] Analytics initialized', {
          writeKey: this.config.writeKey.substring(0, 8) + '...',
          anonymousId: this.anonymousId,
          userId: this.userId,
        });
      }

    } catch (error) {
      console.error('[Cairo] Failed to initialize:', error);
    }
  }

  track(event: string | TrackMessage, properties?: Record<string, any> | Callback, callback?: Callback): void {
    if (!this.shouldTrack()) {
      callback?.();
      return;
    }

    let message: TrackMessage;
    let cb = callback;

    if (typeof event === 'string') {
      if (typeof properties === 'function') {
        cb = properties;
        properties = {};
      }

      message = {
        event,
        properties: properties as Record<string, any> || {},
        userId: this.userId,
        anonymousId: this.anonymousId,
        timestamp: new Date().toISOString(),
        context: this.getContext(),
      };
    } else {
      message = event;
      cb = properties as Callback;
    }

    this.enqueue('track', message, cb);
  }

  identify(userId: string | IdentifyMessage, traits?: Record<string, any> | Callback, callback?: Callback): void {
    if (!this.shouldTrack()) {
      callback?.();
      return;
    }

    let message: IdentifyMessage;
    let cb = callback;

    if (typeof userId === 'string') {
      if (typeof traits === 'function') {
        cb = traits;
        traits = {};
      }

      // Update stored user data
      this.userId = userId;
      this.traits = { ...this.traits, ...(traits as Record<string, any> || {}) };
      this.storage.setUserId(userId);
      this.storage.setTraits(this.traits);

      message = {
        userId,
        traits: this.traits,
        anonymousId: this.anonymousId,
        timestamp: new Date().toISOString(),
        context: this.getContext(),
      };
    } else {
      message = userId;
      cb = traits as Callback;
    }

    this.enqueue('identify', message, cb);
  }

  page(category?: string | PageMessage, name?: string | Record<string, any> | Callback, properties?: Record<string, any> | Callback, callback?: Callback): void {
    if (!this.shouldTrack()) {
      callback?.();
      return;
    }

    let message: PageMessage;
    let cb = callback;

    if (typeof category === 'object') {
      message = category;
      cb = name as Callback;
    } else {
      if (typeof name === 'function') {
        cb = name;
        name = undefined;
        properties = {};
      } else if (typeof properties === 'function') {
        cb = properties;
        properties = {};
      }

      message = {
        category: category as string,
        name: name as string || document.title,
        properties: {
          title: document.title,
          url: window.location.href,
          path: window.location.pathname,
          referrer: document.referrer,
          search: window.location.search,
          ...(properties as Record<string, any> || {}),
        },
        userId: this.userId,
        anonymousId: this.anonymousId,
        timestamp: new Date().toISOString(),
        context: this.getContext(),
      };
    }

    this.enqueue('page', message, cb);
  }

  group(groupId: string | GroupMessage, traits?: Record<string, any> | Callback, callback?: Callback): void {
    if (!this.shouldTrack()) {
      callback?.();
      return;
    }

    let message: GroupMessage;
    let cb = callback;

    if (typeof groupId === 'string') {
      if (typeof traits === 'function') {
        cb = traits;
        traits = {};
      }

      message = {
        groupId,
        traits: traits as Record<string, any> || {},
        userId: this.userId,
        anonymousId: this.anonymousId,
        timestamp: new Date().toISOString(),
        context: this.getContext(),
      };
    } else {
      message = groupId;
      cb = traits as Callback;
    }

    this.enqueue('group', message, cb);
  }

  alias(userId: string | AliasMessage, previousId?: string | Callback, callback?: Callback): void {
    if (!this.shouldTrack()) {
      callback?.();
      return;
    }

    let message: AliasMessage;
    let cb = callback;

    if (typeof userId === 'string') {
      if (typeof previousId === 'function') {
        cb = previousId;
        previousId = this.anonymousId;
      }

      message = {
        userId,
        previousId: previousId as string || this.anonymousId,
        timestamp: new Date().toISOString(),
        context: this.getContext(),
      };
    } else {
      message = userId;
      cb = previousId as Callback;
    }

    this.enqueue('alias', message, cb);
  }

  ready(callback: () => void): void {
    if (this.isReady) {
      callback();
    } else {
      this.readyCallbacks.push(callback);
    }
  }

  user() {
    return {
      anonymousId: () => this.anonymousId,
      id: () => this.userId,
      traits: () => this.traits,
    };
  }

  id(): string | null {
    return this.userId;
  }

  anonymousId(): string {
    return this.anonymousId;
  }

  traits(): Record<string, any> {
    return this.traits;
  }

  reset(): void {
    this.userId = null;
    this.traits = {};
    this.anonymousId = Utils.generateId();
    this.storage.reset();
    this.storage.setAnonymousId(this.anonymousId);
  }

  debug(enabled?: boolean): boolean {
    if (typeof enabled === 'boolean') {
      this.config.debug = enabled;
    }
    return this.config.debug;
  }

  consent = {
    granted: (): boolean => this.consentGranted,
    categories: (): string[] => this.consentCategories,
    grant: (categories?: string[]): void => {
      this.consentGranted = true;
      if (categories) {
        this.consentCategories = categories;
      }
      this.storage.setConsent(true, this.consentCategories);
    },
    revoke: (categories?: string[]): void => {
      if (categories) {
        this.consentCategories = this.consentCategories.filter(c => !categories.includes(c));
        if (this.consentCategories.length === 0) {
          this.consentGranted = false;
        }
      } else {
        this.consentGranted = false;
        this.consentCategories = [];
      }
      this.storage.setConsent(this.consentGranted, this.consentCategories);
    },
  };

  // Private methods

  private shouldTrack(): boolean {
    if (!this.config.enable) return false;
    if (this.config.consent.required && !this.consentGranted) return false;
    return true;
  }

  private enqueue(type: string, message: Message, callback?: Callback): void {
    const enrichedMessage = {
      ...message,
      type,
      messageId: Utils.generateId(),
      timestamp: message.timestamp || new Date().toISOString(),
      context: {
        library: {
          name: 'cairo.js',
          version: '1.0.0',
        },
        ...message.context,
        ...this.getContext(),
      },
    };

    this.queue.enqueue(enrichedMessage, callback);
  }

  private getContext(): Context {
    return {
      page: {
        title: document.title,
        url: window.location.href,
        path: window.location.pathname,
        referrer: document.referrer,
        search: window.location.search,
      },
      userAgent: navigator.userAgent,
      locale: navigator.language,
      screen: {
        width: screen.width,
        height: screen.height,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      campaign: Utils.getCampaignParams(),
    };
  }

  private processQueuedCalls(): void {
    if (Array.isArray(window.cairo)) {
      const queuedCalls = window.cairo.slice();
      window.cairo = this;

      queuedCalls.forEach(([method, ...args]) => {
        if (typeof this[method as keyof this] === 'function') {
          try {
            (this[method as keyof this] as any)(...args);
          } catch (error) {
            if (this.config.debug) {
              console.error(`[Cairo] Error processing queued ${method}:`, error);
            }
          }
        }
      });
    } else {
      window.cairo = this;
    }
  }

  // Auto-tracking setup methods

  private setupPageTracking(): void {
    // Track initial page view
    this.ready(() => {
      this.page();
    });

    // Track navigation changes (for SPAs)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.page();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Handle back/forward navigation
    window.addEventListener('popstate', () => {
      this.page();
    });
  }

  private setupClickTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;

      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.hasAttribute('data-track')) {
        const text = target.textContent?.trim() || '';
        const eventName = target.getAttribute('data-track-event') || 'Element Clicked';

        this.track(eventName, {
          element_type: target.tagName.toLowerCase(),
          element_text: text,
          element_id: target.id,
          element_class: target.className,
          element_selector: Utils.getSelector(target),
        });
      }
    }, true);
  }

  private setupFormTracking(): void {
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      const formData = new FormData(form);
      const fields: string[] = [];

      formData.forEach((_, key) => fields.push(key));

      this.track('Form Submitted', {
        form_id: form.id,
        form_class: form.className,
        form_name: form.name,
        form_fields: fields,
        form_field_count: fields.length,
      });
    }, true);
  }

  private setupScrollTracking(): void {
    let maxScroll = 0;
    const depths = [25, 50, 75, 100];
    const tracked: number[] = [];

    const trackScroll = Utils.throttle(() => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );

      if (scrollPercent > maxScroll) {
        maxScroll = scrollPercent;

        const depth = depths.find(d => scrollPercent >= d && !tracked.includes(d));
        if (depth) {
          tracked.push(depth);
          this.track('Page Scrolled', {
            scroll_depth: depth,
            scroll_percent: scrollPercent,
          });
        }
      }
    }, 500);

    window.addEventListener('scroll', trackScroll, { passive: true });
  }

  private setupPerformanceTracking(): void {
    window.addEventListener('load', () => {
      setTimeout(() => {
        if ('performance' in window) {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

          if (navigation) {
            this.track('Page Performance', {
              load_time: Math.round(navigation.loadEventEnd - navigation.fetchStart),
              dom_ready: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart),
              dns_time: Math.round(navigation.domainLookupEnd - navigation.domainLookupStart),
              connect_time: Math.round(navigation.connectEnd - navigation.connectStart),
              response_time: Math.round(navigation.responseEnd - navigation.requestStart),
              page_url: window.location.href,
            });
          }
        }
      }, 1000);
    });
  }

  private setupErrorTracking(): void {
    window.addEventListener('error', (event) => {
      this.track('JavaScript Error', {
        error_message: event.message,
        error_filename: event.filename,
        error_line: event.lineno,
        error_column: event.colno,
        error_url: window.location.href,
        user_agent: navigator.userAgent,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.track('Unhandled Promise Rejection', {
        error_reason: event.reason?.toString(),
        error_url: window.location.href,
        user_agent: navigator.userAgent,
      });
    });
  }
}