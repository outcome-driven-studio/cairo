import { CairoBrowserConfig, Message, Callback } from './types';
import { Utils } from './utils';

interface QueueItem {
  message: Message;
  callback?: Callback;
  attempts: number;
}

export class Queue {
  private items: QueueItem[] = [];
  private config: Required<CairoBrowserConfig>;
  private flushTimer?: number;

  constructor(config: Required<CairoBrowserConfig>) {
    this.config = config;
    this.startFlushTimer();
  }

  enqueue(message: Message, callback?: Callback): void {
    this.items.push({
      message,
      callback,
      attempts: 0,
    });

    if (this.items.length >= this.config.flushAt) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.items.length === 0) return;

    const batch = this.items.splice(0, this.config.flushAt);

    try {
      await this.sendBatch(batch);

      // Call success callbacks
      batch.forEach(({ callback }) => callback?.());

      if (this.config.debug) {
        console.log(`[Cairo] Flushed ${batch.length} events`);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[Cairo] Flush failed:', error);
      }

      // Retry failed items
      const retryable = batch.filter(item => {
        item.attempts++;
        return item.attempts <= this.config.maxRetries;
      });

      if (retryable.length > 0) {
        this.items.unshift(...retryable);
      } else {
        // Call error callbacks for items that exceeded retry limit
        batch.forEach(({ callback }) => callback?.(error as Error));
      }
    }
  }

  private async sendBatch(batch: QueueItem[]): Promise<void> {
    const payload = {
      batch: batch.map(item => item.message),
      sentAt: new Date().toISOString(),
    };

    const response = await fetch(`${this.config.dataPlaneUrl}/v2/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Write-Key': this.config.writeKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = window.setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}