import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CairoReactConfig, TrackOptions, IdentifyOptions, PageOptions } from './types';

/**
 * Browser-optimized Cairo client for React applications
 */
export class CairoBrowserClient {
  private config: CairoReactConfig;
  private httpClient: AxiosInstance;
  private queue: Array<{ message: any; callback?: Function }> = [];
  private flushTimer?: number;
  private anonymousId: string;
  private userId: string | null = null;
  private traits: Record<string, any> = {};
  private ready: boolean = false;
  private consentGranted: boolean = true;
  private consentCategories: string[] = [];

  constructor(config: CairoReactConfig) {
    if (!config.writeKey) {
      throw new Error('Cairo React SDK: writeKey is required');
    }

    this.config = {
      dataPlaneUrl: 'http://localhost:8080',
      flushAt: 20,
      flushInterval: 10000,
      maxRetries: 3,
      timeout: 10000,
      debug: false,
      enable: true,
      autoTrack: {
        pageViews: true,
        clicks: false,
        formSubmissions: false,
        performance: false,
      },
      consent: {
        required: false,
        categories: [],
      },
      loadTimeout: 5000,
      ...config,
    };

    // Generate or retrieve anonymous ID
    this.anonymousId = this.getOrCreateAnonymousId();

    // Set up user if provided
    if (this.config.user?.userId) {
      this.userId = this.config.user.userId;
    }
    if (this.config.user?.traits) {
      this.traits = this.config.user.traits;
    }

    // Set up consent
    if (this.config.consent?.required) {
      this.consentGranted = false;
    }

    // Setup HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.dataPlaneUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Write-Key': this.config.writeKey,
      },
    });

    // Start auto-flush timer
    this.startFlushTimer();

    // Auto-track page views if enabled
    if (this.config.autoTrack?.pageViews) {
      this.setupAutoPageTracking();
    }

    // Auto-track clicks if enabled
    if (this.config.autoTrack?.clicks) {
      this.setupAutoClickTracking();
    }

    // Auto-track form submissions if enabled
    if (this.config.autoTrack?.formSubmissions) {
      this.setupAutoFormTracking();
    }

    this.ready = true;

    if (this.config.debug) {
      console.log('[Cairo React SDK] Initialized:', {
        ...this.config,
        writeKey: '***',
        anonymousId: this.anonymousId,
      });
    }
  }

  /**
   * Track an event
   */
  track(event: string, properties?: Record<string, any>, options: TrackOptions = {}): void {
    if (!this.shouldTrack()) {
      options.callback?.();
      return;
    }

    const message = {
      type: 'track',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: options.userId || this.userId,
      anonymousId: this.anonymousId,
      event,
      properties: properties || {},
      context: {
        library: {
          name: '@cairo/react',
          version: '1.0.0',
        },
        page: this.getPageContext(),
        userAgent: navigator.userAgent,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: {
          width: screen.width,
          height: screen.height,
        },
        ...options.context,
      },
    };

    this.enqueue(message, options.callback);
  }

  /**
   * Identify a user
   */
  identify(userId: string, traits?: Record<string, any>, options: IdentifyOptions = {}): void {
    if (!this.shouldTrack()) {
      options.callback?.();
      return;
    }

    this.userId = userId;
    if (traits) {
      this.traits = { ...this.traits, ...traits };
    }

    // Store in localStorage for persistence
    try {
      localStorage.setItem('cairo_user_id', userId);
      localStorage.setItem('cairo_traits', JSON.stringify(this.traits));
    } catch (e) {
      if (this.config.debug) {
        console.warn('[Cairo React SDK] Unable to store user data in localStorage');
      }
    }

    const message = {
      type: 'identify',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId,
      anonymousId: this.anonymousId,
      traits: this.traits,
      context: {
        library: {
          name: '@cairo/react',
          version: '1.0.0',
        },
        page: this.getPageContext(),
        ...options.context,
      },
    };

    this.enqueue(message, options.callback);
  }

  /**
   * Track a page view
   */
  page(category?: string, name?: string, properties?: Record<string, any>, options: PageOptions = {}): void {
    if (!this.shouldTrack()) {
      options.callback?.();
      return;
    }

    const message = {
      type: 'page',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: options.userId || this.userId,
      anonymousId: this.anonymousId,
      category,
      name: name || document.title,
      properties: {
        url: window.location.href,
        path: window.location.pathname,
        search: window.location.search,
        title: document.title,
        referrer: document.referrer,
        ...properties,
      },
      context: {
        library: {
          name: '@cairo/react',
          version: '1.0.0',
        },
        page: this.getPageContext(),
        ...options.context,
      },
    };

    this.enqueue(message, options.callback);
  }

  /**
   * Associate user with a group
   */
  group(groupId: string, traits?: Record<string, any>, options: TrackOptions = {}): void {
    if (!this.shouldTrack()) {
      options.callback?.();
      return;
    }

    const message = {
      type: 'group',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: options.userId || this.userId,
      anonymousId: this.anonymousId,
      groupId,
      traits: traits || {},
      context: {
        library: {
          name: '@cairo/react',
          version: '1.0.0',
        },
        page: this.getPageContext(),
        ...options.context,
      },
    };

    this.enqueue(message, options.callback);
  }

  /**
   * Create an alias
   */
  alias(userId: string, previousId: string, options: TrackOptions = {}): void {
    if (!this.shouldTrack()) {
      options.callback?.();
      return;
    }

    const message = {
      type: 'alias',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId,
      previousId,
      context: {
        library: {
          name: '@cairo/react',
          version: '1.0.0',
        },
        page: this.getPageContext(),
        ...options.context,
      },
    };

    this.enqueue(message, options.callback);
  }

  /**
   * Flush the queue
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const messages = this.queue.splice(0);

    try {
      await this.httpClient.post('/v2/batch', {
        batch: messages.map(m => m.message),
        sentAt: new Date().toISOString(),
      });

      if (this.config.debug) {
        console.log(`[Cairo React SDK] Flushed ${messages.length} events`);
      }

      // Call success callbacks
      messages.forEach(({ callback }) => callback?.());
    } catch (error) {
      if (this.config.debug) {
        console.error('[Cairo React SDK] Flush failed:', error);
      }

      // Call error callbacks
      messages.forEach(({ callback }) => callback?.(error));
    }
  }

  /**
   * Reset the client
   */
  reset(): void {
    this.userId = null;
    this.traits = {};
    this.queue = [];
    this.anonymousId = this.generateAnonymousId();

    try {
      localStorage.removeItem('cairo_user_id');
      localStorage.removeItem('cairo_traits');
      localStorage.setItem('cairo_anonymous_id', this.anonymousId);
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Grant consent
   */
  grantConsent(categories?: string[]): void {
    this.consentGranted = true;
    if (categories) {
      this.consentCategories = categories;
    }

    try {
      localStorage.setItem('cairo_consent', 'granted');
      if (categories) {
        localStorage.setItem('cairo_consent_categories', JSON.stringify(categories));
      }
    } catch (e) {
      // Ignore localStorage errors
    }

    if (this.config.debug) {
      console.log('[Cairo React SDK] Consent granted:', categories);
    }
  }

  /**
   * Revoke consent
   */
  revokeConsent(categories?: string[]): void {
    if (categories) {
      this.consentCategories = this.consentCategories.filter(c => !categories.includes(c));
      if (this.consentCategories.length === 0) {
        this.consentGranted = false;
      }
    } else {
      this.consentGranted = false;
      this.consentCategories = [];
    }

    try {
      localStorage.setItem('cairo_consent', this.consentGranted ? 'granted' : 'revoked');
      localStorage.setItem('cairo_consent_categories', JSON.stringify(this.consentCategories));
    } catch (e) {
      // Ignore localStorage errors
    }

    if (this.config.debug) {
      console.log('[Cairo React SDK] Consent revoked:', categories);
    }
  }

  /**
   * Get user info
   */
  getUser(): { anonymousId: string | null; userId: string | null; traits: Record<string, any> } {
    return {
      anonymousId: this.anonymousId,
      userId: this.userId,
      traits: this.traits,
    };
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get consent status
   */
  getConsent(): { granted: boolean; categories: string[] } {
    return {
      granted: this.consentGranted,
      categories: this.consentCategories,
    };
  }

  // Private methods

  private shouldTrack(): boolean {
    if (!this.config.enable) return false;
    if (this.config.consent?.required && !this.consentGranted) return false;
    return true;
  }

  private enqueue(message: any, callback?: Function): void {
    this.queue.push({ message, callback });

    if (this.queue.length >= this.config.flushAt!) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval! > 0) {
      this.flushTimer = window.setInterval(() => {
        this.flush();
      }, this.config.flushInterval!);
    }
  }

  private getOrCreateAnonymousId(): string {
    try {
      let id = localStorage.getItem('cairo_anonymous_id');
      if (!id) {
        id = this.generateAnonymousId();
        localStorage.setItem('cairo_anonymous_id', id);
      }
      return id;
    } catch (e) {
      return this.generateAnonymousId();
    }
  }

  private generateAnonymousId(): string {
    return uuidv4();
  }

  private getPageContext(): Record<string, any> {
    return {
      url: window.location.href,
      path: window.location.pathname,
      search: window.location.search,
      title: document.title,
      referrer: document.referrer,
    };
  }

  private setupAutoPageTracking(): void {
    // Track initial page view
    setTimeout(() => {
      this.page();
    }, 100);

    // Track page changes (for SPAs)
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        this.page();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also listen to popstate for back/forward navigation
    window.addEventListener('popstate', () => {
      this.page();
    });
  }

  private setupAutoClickTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;

      // Only track buttons, links, and elements with data-track attribute
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.hasAttribute('data-track')
      ) {
        const text = target.textContent?.trim() || '';
        const eventName = target.getAttribute('data-track-event') || 'Element Clicked';

        this.track(eventName, {
          element_type: target.tagName.toLowerCase(),
          element_text: text,
          element_id: target.id,
          element_class: target.className,
          url: window.location.href,
        });
      }
    });
  }

  private setupAutoFormTracking(): void {
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      const formData = new FormData(form);
      const fields: string[] = [];

      formData.forEach((_, key) => {
        fields.push(key);
      });

      this.track('Form Submitted', {
        form_id: form.id,
        form_class: form.className,
        form_fields: fields,
        url: window.location.href,
      });
    });
  }
}