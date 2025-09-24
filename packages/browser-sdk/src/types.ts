export interface CairoBrowserConfig {
  writeKey: string;
  dataPlaneUrl?: string;
  flushAt?: number;
  flushInterval?: number;
  maxRetries?: number;
  timeout?: number;
  debug?: boolean;
  enable?: boolean;
  cookieDomain?: string;
  cookieSecure?: boolean;
  crossDomainTracking?: boolean;
  autoTrack?: {
    pageViews?: boolean;
    clicks?: boolean;
    formSubmissions?: boolean;
    scrollDepth?: boolean;
    performance?: boolean;
    errors?: boolean;
  };
  consent?: {
    required?: boolean;
    defaultCategories?: string[];
  };
  integrations?: Record<string, boolean | Record<string, any>>;
}

export interface CommonFields {
  anonymousId?: string;
  userId?: string;
  timestamp?: string;
  context?: Context;
  integrations?: Record<string, boolean | Record<string, any>>;
}

export interface Context {
  app?: {
    name?: string;
    version?: string;
  };
  campaign?: {
    name?: string;
    source?: string;
    medium?: string;
    term?: string;
    content?: string;
  };
  device?: {
    type?: string;
  };
  library?: {
    name: string;
    version: string;
  };
  locale?: string;
  os?: {
    name?: string;
    version?: string;
  };
  page?: {
    path?: string;
    referrer?: string;
    search?: string;
    title?: string;
    url?: string;
  };
  referrer?: {
    type?: string;
    name?: string;
    url?: string;
  };
  screen?: {
    height?: number;
    width?: number;
  };
  timezone?: string;
  userAgent?: string;
}

export interface TrackMessage extends CommonFields {
  event: string;
  properties?: Record<string, any>;
}

export interface IdentifyMessage extends CommonFields {
  userId: string;
  traits?: Record<string, any>;
}

export interface PageMessage extends CommonFields {
  name?: string;
  category?: string;
  properties?: Record<string, any>;
}

export interface GroupMessage extends CommonFields {
  groupId: string;
  traits?: Record<string, any>;
}

export interface AliasMessage extends CommonFields {
  userId: string;
  previousId: string;
}

export type Message =
  | TrackMessage
  | IdentifyMessage
  | PageMessage
  | GroupMessage
  | AliasMessage;

export interface BatchMessage {
  batch: Message[];
  timestamp: string;
  sentAt: string;
}

export interface Callback {
  (error?: Error, response?: any): void;
}

export interface CairoAnalytics {
  track(event: string, properties?: Record<string, any>, callback?: Callback): void;
  track(message: TrackMessage, callback?: Callback): void;

  identify(userId: string, traits?: Record<string, any>, callback?: Callback): void;
  identify(message: IdentifyMessage, callback?: Callback): void;

  page(name?: string, properties?: Record<string, any>, callback?: Callback): void;
  page(category: string, name?: string, properties?: Record<string, any>, callback?: Callback): void;
  page(message: PageMessage, callback?: Callback): void;

  group(groupId: string, traits?: Record<string, any>, callback?: Callback): void;
  group(message: GroupMessage, callback?: Callback): void;

  alias(userId: string, previousId: string, callback?: Callback): void;
  alias(message: AliasMessage, callback?: Callback): void;

  ready(callback: () => void): void;
  user(): { anonymousId(): string; id(): string | null; traits(): Record<string, any> };
  id(): string | null;
  anonymousId(): string;
  traits(): Record<string, any>;
  reset(): void;
  debug(enabled?: boolean): boolean;

  // Consent management
  consent: {
    granted(): boolean;
    categories(): string[];
    grant(categories?: string[]): void;
    revoke(categories?: string[]): void;
  };
}