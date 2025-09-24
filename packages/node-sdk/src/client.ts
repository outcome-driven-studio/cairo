import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { v4 as uuidv4 } from 'uuid';
import { EventQueue } from './queue';
import { EventValidator } from './validator';
import {
  CairoConfig,
  TrackMessage,
  IdentifyMessage,
  PageMessage,
  ScreenMessage,
  GroupMessage,
  AliasMessage,
  Callback,
  Context,
  Message,
} from './types';

const DEFAULT_CONFIG: Partial<CairoConfig> = {
  dataPlaneUrl: 'http://localhost:8080',
  flushAt: 20,
  flushInterval: 10000,
  maxRetries: 3,
  timeout: 10000,
  debug: false,
  enable: true,
};

export class CairoClient {
  private config: CairoConfig;
  private queue: EventQueue;
  private validator: EventValidator;
  private httpClient: AxiosInstance;
  private flushTimer?: NodeJS.Timeout;

  constructor(config: CairoConfig) {
    if (!config.writeKey) {
      throw new Error('Cairo SDK: writeKey is required');
    }

    this.config = { ...DEFAULT_CONFIG, ...config } as CairoConfig;
    this.queue = new EventQueue(this.config.flushAt!);
    this.validator = new EventValidator();

    // Setup HTTP client with retries
    this.httpClient = axios.create({
      baseURL: this.config.dataPlaneUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Write-Key': this.config.writeKey,
      },
    });

    // Configure retry logic
    axiosRetry(this.httpClient, {
      retries: this.config.maxRetries!,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ?? 0) >= 500;
      },
    });

    // Start flush timer
    this.startFlushTimer();

    if (this.config.debug) {
      console.log('[Cairo SDK] Initialized with config:', {
        ...this.config,
        writeKey: '***',
      });
    }
  }

  /**
   * Track an event
   */
  track(event: string | TrackMessage, properties?: Record<string, any>, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: TrackMessage;

    if (typeof event === 'string') {
      message = {
        event,
        properties,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    } else {
      message = event;
      callback = properties as Callback;
    }

    this.enqueue('track', message, callback);
  }

  /**
   * Identify a user
   */
  identify(userId: string | IdentifyMessage, traits?: Record<string, any>, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: IdentifyMessage;

    if (typeof userId === 'string') {
      message = {
        userId,
        traits,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    } else {
      message = userId;
      callback = traits as Callback;
    }

    this.enqueue('identify', message, callback);
  }

  /**
   * Track a page view
   */
  page(category?: string | PageMessage, name?: string, properties?: Record<string, any>, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: PageMessage;

    if (typeof category === 'object') {
      message = category;
      callback = name as Callback;
    } else {
      message = {
        category,
        name,
        properties,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    }

    this.enqueue('page', message, callback);
  }

  /**
   * Track a screen view (mobile)
   */
  screen(category?: string | ScreenMessage, name?: string, properties?: Record<string, any>, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: ScreenMessage;

    if (typeof category === 'object') {
      message = category;
      callback = name as Callback;
    } else {
      message = {
        category,
        name,
        properties,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    }

    this.enqueue('screen', message, callback);
  }

  /**
   * Associate a user with a group
   */
  group(groupId: string | GroupMessage, traits?: Record<string, any>, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: GroupMessage;

    if (typeof groupId === 'string') {
      message = {
        groupId,
        traits,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    } else {
      message = groupId;
      callback = traits as Callback;
    }

    this.enqueue('group', message, callback);
  }

  /**
   * Create an alias for a user
   */
  alias(userId: string | AliasMessage, previousId?: string, context?: Context, callback?: Callback): void {
    if (!this.config.enable) {
      callback?.();
      return;
    }

    let message: AliasMessage;

    if (typeof userId === 'string' && previousId) {
      message = {
        userId,
        previousId,
        context: context || {},
        timestamp: new Date().toISOString(),
      };
    } else {
      message = userId as AliasMessage;
      callback = previousId as Callback;
    }

    this.enqueue('alias', message, callback);
  }

  /**
   * Flush the queue immediately
   */
  async flush(callback?: Callback): Promise<void> {
    if (this.config.debug) {
      console.log('[Cairo SDK] Flushing queue...');
    }

    const messages = this.queue.flush();
    if (messages.length === 0) {
      callback?.();
      return;
    }

    try {
      await this.sendBatch(messages);
      callback?.();
    } catch (error) {
      callback?.(error as Error);
    }
  }

  /**
   * Reset the client (clear queue)
   */
  reset(): void {
    this.queue.clear();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }

  /**
   * Enqueue a message
   */
  private enqueue(type: string, message: Message, callback?: Callback): void {
    // Add metadata
    const enrichedMessage = {
      ...message,
      type,
      messageId: uuidv4(),
      timestamp: message.timestamp || new Date().toISOString(),
      context: {
        library: {
          name: '@cairo/node-sdk',
          version: '1.0.0',
        },
        ...message.context,
      },
    };

    // Validate message
    const validation = this.validator.validate(type, enrichedMessage);
    if (!validation.valid) {
      const error = new Error(`Validation failed: ${validation.errors?.join(', ')}`);
      callback?.(error);
      if (this.config.debug) {
        console.error('[Cairo SDK] Validation error:', error);
      }
      return;
    }

    // Add to queue
    this.queue.add(enrichedMessage, callback);

    if (this.config.debug) {
      console.log(`[Cairo SDK] Enqueued ${type} event`);
    }

    // Check if we should flush
    if (this.queue.size() >= this.config.flushAt!) {
      this.flush();
    }
  }

  /**
   * Send a batch of messages
   */
  private async sendBatch(messages: Array<{ message: Message; callback?: Callback }>): Promise<void> {
    const batch = messages.map(m => m.message);

    try {
      const response = await this.httpClient.post('/v2/batch', {
        batch,
        sentAt: new Date().toISOString(),
      });

      if (this.config.debug) {
        console.log('[Cairo SDK] Batch sent successfully:', response.data);
      }

      // Call success callbacks
      messages.forEach(({ callback }) => callback?.());
    } catch (error) {
      if (this.config.debug) {
        console.error('[Cairo SDK] Batch send failed:', error);
      }

      // Call error callbacks
      messages.forEach(({ callback }) => callback?.(error as Error));

      throw error;
    }
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.config.flushInterval! > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval!);

      // Ensure timer doesn't prevent process from exiting
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }
    }
  }
}

// Export a singleton factory
let instance: CairoClient | null = null;

export function createClient(config: CairoConfig): CairoClient {
  instance = new CairoClient(config);
  return instance;
}

export function getClient(): CairoClient | null {
  return instance;
}