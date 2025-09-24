import { Message, Callback } from './types';

interface QueueItem {
  message: Message;
  callback?: Callback;
  attempts: number;
  timestamp: number;
}

/**
 * Event queue for batching messages
 */
export class EventQueue {
  private items: QueueItem[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Add a message to the queue
   */
  add(message: Message, callback?: Callback): void {
    this.items.push({
      message,
      callback,
      attempts: 0,
      timestamp: Date.now(),
    });

    // Remove oldest items if queue is too large
    while (this.items.length > this.maxSize * 2) {
      const removed = this.items.shift();
      removed?.callback?.(new Error('Queue overflow - message dropped'));
    }
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Flush messages from queue
   */
  flush(limit?: number): Array<{ message: Message; callback?: Callback }> {
    const count = limit || this.maxSize;
    const flushed = this.items.splice(0, count);

    return flushed.map(item => ({
      message: item.message,
      callback: item.callback,
    }));
  }

  /**
   * Clear the queue
   */
  clear(): void {
    // Call error callbacks for any pending messages
    this.items.forEach(item => {
      item.callback?.(new Error('Queue cleared'));
    });
    this.items = [];
  }

  /**
   * Get all messages without removing
   */
  peek(): Message[] {
    return this.items.map(item => item.message);
  }

  /**
   * Requeue failed messages
   */
  requeue(messages: Array<{ message: Message; callback?: Callback }>): void {
    // Add failed messages back to front of queue
    const requeueItems: QueueItem[] = messages.map(({ message, callback }) => ({
      message,
      callback,
      attempts: 1,
      timestamp: Date.now(),
    }));

    this.items.unshift(...requeueItems);
  }

  /**
   * Remove old messages
   */
  prune(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    const pruned: QueueItem[] = [];

    this.items = this.items.filter(item => {
      if (item.timestamp < cutoff) {
        pruned.push(item);
        return false;
      }
      return true;
    });

    // Call error callbacks for pruned messages
    pruned.forEach(item => {
      item.callback?.(new Error('Message expired'));
    });
  }
}