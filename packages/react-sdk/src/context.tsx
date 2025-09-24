import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CairoBrowserClient } from './client';
import { CairoContextValue, CairoProviderProps, CairoReactConfig } from './types';

const CairoContext = createContext<CairoContextValue | null>(null);

/**
 * Cairo Provider Component
 * Provides Cairo client and state to child components
 */
export const CairoProvider: React.FC<CairoProviderProps> = ({
  children,
  writeKey,
  config = {},
  ready = true,
}) => {
  const [client, setClient] = useState<CairoBrowserClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState({
    anonymousId: null as string | null,
    userId: null as string | null,
    traits: {} as Record<string, any>,
  });
  const [consent, setConsent] = useState({
    granted: true,
    categories: [] as string[],
  });

  // Initialize client
  useEffect(() => {
    if (!ready || client) return;

    const cairoConfig: CairoReactConfig = {
      writeKey,
      ...config,
    };

    try {
      const newClient = new CairoBrowserClient(cairoConfig);
      setClient(newClient);
      setIsReady(newClient.isReady());

      // Update user state
      setUser(newClient.getUser());

      // Update consent state
      setConsent(newClient.getConsent());

      if (cairoConfig.debug) {
        console.log('[Cairo Provider] Client initialized');
      }
    } catch (error) {
      console.error('[Cairo Provider] Failed to initialize client:', error);
    }
  }, [writeKey, config, ready, client]);

  // Context value
  const contextValue: CairoContextValue = {
    client,
    ready: isReady && !!client,
    config: { writeKey, ...config } as CairoReactConfig,
    consent: {
      granted: consent.granted,
      categories: consent.categories,
      grant: (categories?: string[]) => {
        if (client) {
          client.grantConsent(categories);
          setConsent(client.getConsent());
        }
      },
      revoke: (categories?: string[]) => {
        if (client) {
          client.revokeConsent(categories);
          setConsent(client.getConsent());
        }
      },
    },
    user,
  };

  return (
    <CairoContext.Provider value={contextValue}>
      {children}
    </CairoContext.Provider>
  );
};

/**
 * Hook to access Cairo context
 */
export const useCairoContext = (): CairoContextValue => {
  const context = useContext(CairoContext);

  if (!context) {
    throw new Error('useCairoContext must be used within a CairoProvider');
  }

  return context;
};