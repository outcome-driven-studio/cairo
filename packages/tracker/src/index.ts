import { v4 as uuidv4 } from 'uuid';
import { HttpClient } from './client';
import { EventQueue } from './queue';
import {
  TrackerConfig,
  TrackOptions,
  IdentifyOptions,
  PageOptions,
  GroupOptions,
  AliasOptions,
  Message,
} from './types';

const LIBRARY_NAME = '@cairo/tracker';
const LIBRARY_VERSION = '1.0.0';

const DEFAULTS: Required<Omit<TrackerConfig, 'writeKey'>> = {
  host: 'http://localhost:8080',
  flushAt: 20,
  flushInterval: 5000,
  maxRetries: 3,
  timeout: 10000,
  debug: false,
  enable: true,
};

export class Cairo {
  private config: Required<TrackerConfig>;
  private queue: EventQueue;
  private httpClient: HttpClient;
  private flushTimer?: ReturnType<typeof setInterval>;

  private constructor(config: TrackerConfig) {
    if (!config.writeKey) {
      throw new Error('Cairo: writeKey is required');
    }

    this.config = { ...DEFAULTS, ...config } as Required<TrackerConfig>;
    this.queue = new EventQueue(this.config.flushAt * 2);
    this.httpClient = new HttpClient({
      host: this.config.host,
      writeKey: this.config.writeKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      debug: this.config.debug,
    });

    this.startFlushTimer();

    if (this.config.debug) {
      console.log('[Cairo] Initialized', { host: this.config.host });
    }
  }

  /**
   * Initialize a Cairo tracker instance.
   *
   * ```ts
   * const cairo = Cairo.init({ writeKey: 'your-write-key' });
   * ```
   */
  static init(config: TrackerConfig): Cairo {
    return new Cairo(config);
  }

  // --- Product Event Methods ---

  /**
   * Track an event.
   *
   * ```ts
   * cairo.track({
   *   event: 'story_generated',
   *   userId: 'user_123',
   *   properties: { theme: 'pirates', pages: 12 }
   * });
   * ```
   */
  track(options: TrackOptions): void {
    if (!options.event) {
      throw new Error('Cairo.track: event name is required');
    }

    this.enqueue({
      type: 'track',
      event: options.event,
      userId: options.userId,
      anonymousId: options.anonymousId,
      properties: options.properties,
      timestamp: options.timestamp,
      context: options.context,
    });
  }

  /**
   * Identify a user with traits.
   *
   * ```ts
   * cairo.identify({
   *   userId: 'user_123',
   *   traits: { name: 'Ava', school: 'Lincoln Elementary', plan: 'free' }
   * });
   * ```
   */
  identify(options: IdentifyOptions): void {
    if (!options.userId) {
      throw new Error('Cairo.identify: userId is required');
    }

    this.enqueue({
      type: 'identify',
      userId: options.userId,
      traits: options.traits,
      timestamp: options.timestamp,
      context: options.context,
    });
  }

  /**
   * Track a page view.
   *
   * ```ts
   * cairo.page({ name: 'Story Builder', userId: 'user_123' });
   * ```
   */
  page(options: PageOptions = {}): void {
    this.enqueue({
      type: 'page',
      event: options.name,
      userId: options.userId,
      anonymousId: options.anonymousId,
      properties: options.properties,
      timestamp: options.timestamp,
      context: options.context,
    });
  }

  /**
   * Associate a user with a group (school, org, team).
   *
   * ```ts
   * cairo.group({
   *   groupId: 'school_456',
   *   userId: 'user_123',
   *   traits: { name: 'Lincoln Elementary', plan: 'pro' }
   * });
   * ```
   */
  group(options: GroupOptions): void {
    if (!options.groupId) {
      throw new Error('Cairo.group: groupId is required');
    }

    this.enqueue({
      type: 'group',
      userId: options.userId,
      groupId: options.groupId,
      traits: options.traits,
      timestamp: options.timestamp,
      context: options.context,
    });
  }

  /**
   * Link two user identities together.
   *
   * ```ts
   * cairo.alias({ userId: 'user_123', previousId: 'anon_abc' });
   * ```
   */
  alias(options: AliasOptions): void {
    if (!options.userId || !options.previousId) {
      throw new Error('Cairo.alias: userId and previousId are required');
    }

    this.enqueue({
      type: 'alias',
      userId: options.userId,
      previousId: options.previousId,
      timestamp: options.timestamp,
      context: options.context,
    });
  }

  // --- Flush & Shutdown ---

  /** Flush all queued events to Cairo immediately. */
  async flush(): Promise<void> {
    const messages = this.queue.flush();
    if (messages.length === 0) return;

    try {
      await this.httpClient.sendBatch(messages);
    } catch (err) {
      if (this.config.debug) {
        console.error('[Cairo] Flush failed:', err);
      }
    }
  }

  /** Flush remaining events and stop the timer. Call before process exit. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();

    if (this.config.debug) {
      console.log('[Cairo] Shut down');
    }
  }

  // --- Internal ---

  private enqueue(opts: {
    type: Message['type'];
    event?: string;
    userId?: string;
    anonymousId?: string;
    properties?: Record<string, unknown>;
    traits?: Record<string, unknown>;
    groupId?: string;
    previousId?: string;
    timestamp?: string;
    context?: Record<string, unknown>;
  }): void {
    if (!this.config.enable) return;

    const message: Message = {
      type: opts.type,
      messageId: uuidv4(),
      timestamp: opts.timestamp || new Date().toISOString(),
      context: {
        ...opts.context,
        library: { name: LIBRARY_NAME, version: LIBRARY_VERSION },
      },
    };

    if (opts.event) message.event = opts.event;
    if (opts.userId) message.userId = opts.userId;
    if (opts.anonymousId) message.anonymousId = opts.anonymousId;
    if (opts.properties) message.properties = opts.properties;
    if (opts.traits) message.traits = opts.traits;
    if (opts.groupId) message.groupId = opts.groupId;
    if (opts.previousId) message.previousId = opts.previousId;

    this.queue.add(message);

    if (this.queue.size() >= this.config.flushAt) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);

      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        (this.flushTimer as NodeJS.Timeout).unref();
      }
    }
  }
}

export * from './types';
export { EventQueue } from './queue';
export { HttpClient } from './client';
