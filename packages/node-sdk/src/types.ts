/**
 * Cairo SDK Type Definitions
 */

export interface CairoConfig {
  writeKey: string;
  dataPlaneUrl?: string;
  flushAt?: number;
  flushInterval?: number;
  maxRetries?: number;
  timeout?: number;
  debug?: boolean;
  enable?: boolean;
}

export interface CommonFields {
  anonymousId?: string;
  userId?: string;
  timestamp?: Date | string;
  context?: Context;
  integrations?: Record<string, boolean | Record<string, any>>;
}

export interface Context {
  app?: {
    name?: string;
    version?: string;
    build?: string;
  };
  campaign?: {
    name?: string;
    source?: string;
    medium?: string;
    term?: string;
    content?: string;
  };
  device?: {
    id?: string;
    advertisingId?: string;
    manufacturer?: string;
    model?: string;
    name?: string;
    type?: string;
    version?: string;
  };
  ip?: string;
  library?: {
    name: string;
    version: string;
  };
  locale?: string;
  network?: {
    bluetooth?: boolean;
    carrier?: string;
    cellular?: boolean;
    wifi?: boolean;
  };
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
    link?: string;
  };
  screen?: {
    density?: number;
    height?: number;
    width?: number;
  };
  timezone?: string;
  groupId?: string;
  traits?: Record<string, any>;
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

export interface ScreenMessage extends CommonFields {
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
  | ScreenMessage
  | GroupMessage
  | AliasMessage;

export interface BatchMessage {
  batch: Message[];
  timestamp?: string;
  sentAt?: string;
  messageId?: string;
}

export interface Callback {
  (error?: Error, response?: any): void;
}

export interface CairoSDK {
  track(message: TrackMessage, callback?: Callback): void;
  track(event: string, properties?: Record<string, any>, callback?: Callback): void;
  track(event: string, properties?: Record<string, any>, context?: Context, callback?: Callback): void;

  identify(message: IdentifyMessage, callback?: Callback): void;
  identify(userId: string, traits?: Record<string, any>, callback?: Callback): void;
  identify(userId: string, traits?: Record<string, any>, context?: Context, callback?: Callback): void;

  page(message: PageMessage, callback?: Callback): void;
  page(category?: string, name?: string, properties?: Record<string, any>, callback?: Callback): void;

  screen(message: ScreenMessage, callback?: Callback): void;
  screen(category?: string, name?: string, properties?: Record<string, any>, callback?: Callback): void;

  group(message: GroupMessage, callback?: Callback): void;
  group(groupId: string, traits?: Record<string, any>, callback?: Callback): void;

  alias(message: AliasMessage, callback?: Callback): void;
  alias(userId: string, previousId: string, callback?: Callback): void;

  flush(callback?: Callback): Promise<void>;

  reset(): void;
}