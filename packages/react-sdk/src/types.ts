import { ReactNode } from 'react';
import { CairoConfig, TrackMessage, IdentifyMessage, PageMessage, Callback } from '@cairo/node-sdk';

export interface CairoReactConfig extends Omit<CairoConfig, 'writeKey'> {
  writeKey: string;
  autoTrack?: {
    pageViews?: boolean;
    clicks?: boolean;
    formSubmissions?: boolean;
    performance?: boolean;
  };
  consent?: {
    required?: boolean;
    categories?: string[];
  };
  user?: {
    anonymousId?: string;
    userId?: string;
    traits?: Record<string, any>;
  };
  loadTimeout?: number;
}

export interface CairoProviderProps {
  children: ReactNode;
  writeKey: string;
  config?: Partial<CairoReactConfig>;
  ready?: boolean;
}

export interface CairoContextValue {
  client: any;
  ready: boolean;
  config: CairoReactConfig;
  consent: {
    granted: boolean;
    categories: string[];
    grant: (categories?: string[]) => void;
    revoke: (categories?: string[]) => void;
  };
  user: {
    anonymousId: string | null;
    userId: string | null;
    traits: Record<string, any>;
  };
}

export interface TrackOptions {
  userId?: string;
  context?: Record<string, any>;
  callback?: Callback;
}

export interface IdentifyOptions {
  context?: Record<string, any>;
  callback?: Callback;
}

export interface PageOptions extends TrackOptions {
  category?: string;
  name?: string;
}

export interface UseCairoReturn {
  track: (event: string | TrackMessage, properties?: Record<string, any>, options?: TrackOptions) => void;
  identify: (userId: string | IdentifyMessage, traits?: Record<string, any>, options?: IdentifyOptions) => void;
  page: (category?: string | PageMessage, name?: string, properties?: Record<string, any>, options?: PageOptions) => void;
  group: (groupId: string, traits?: Record<string, any>, options?: TrackOptions) => void;
  alias: (userId: string, previousId: string, options?: TrackOptions) => void;
  ready: boolean;
  user: {
    anonymousId: string | null;
    userId: string | null;
    traits: Record<string, any>;
  };
  consent: {
    granted: boolean;
    categories: string[];
    grant: (categories?: string[]) => void;
    revoke: (categories?: string[]) => void;
  };
  reset: () => void;
}

export interface AutoTrackOptions {
  element?: HTMLElement | string;
  event?: string;
  properties?: Record<string, any> | ((element: HTMLElement) => Record<string, any>);
  category?: string;
  label?: string;
}