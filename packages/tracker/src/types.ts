// --- Configuration ---

export interface TrackerConfig {
  /** Write key for authenticating with your Cairo instance */
  writeKey: string;
  /** Cairo server URL (default: http://localhost:8080) */
  host?: string;
  /** Number of events to batch before flushing (default: 20) */
  flushAt?: number;
  /** Milliseconds between automatic flushes (default: 5000) */
  flushInterval?: number;
  /** Max retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Disable tracking entirely, useful for dev (default: true) */
  enable?: boolean;
}

// --- Product Events ---

export interface TrackOptions {
  /** Event name (e.g. "signup", "story_generated", "purchase") */
  event: string;
  /** User ID or anonymous ID */
  userId?: string;
  anonymousId?: string;
  /** Event properties */
  properties?: Record<string, unknown>;
  /** ISO timestamp override */
  timestamp?: string;
  /** Additional context (device, app, etc.) */
  context?: Record<string, unknown>;
}

export interface IdentifyOptions {
  /** The user's ID in your system */
  userId: string;
  /** User traits (name, email, plan, etc.) */
  traits?: Record<string, unknown>;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export interface PageOptions {
  /** Page name */
  name?: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export interface GroupOptions {
  /** The group/org ID */
  groupId: string;
  userId?: string;
  /** Group traits (name, plan, industry, etc.) */
  traits?: Record<string, unknown>;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export interface AliasOptions {
  /** The new user ID */
  userId: string;
  /** The previous anonymous or user ID */
  previousId: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

// --- Internal ---

export interface Message {
  type: 'track' | 'identify' | 'page' | 'screen' | 'group' | 'alias';
  event?: string;
  messageId: string;
  timestamp: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  groupId?: string;
  previousId?: string;
  context: Record<string, unknown>;
}
