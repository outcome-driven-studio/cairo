import { useState, useEffect, useRef, useCallback } from 'react';

type WebSocketMessage = {
  type: string;
  data?: any;
  timestamp: string;
  clientId?: string;
  recentEvents?: any[];
  channels?: string[];
  filters?: any;
};

type WebSocketConfig = {
  url?: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
};

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

export function useWebSocket(config: WebSocketConfig = {}) {
  const {
    url = '/ws',
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    heartbeatInterval = 30000,
  } = config;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const reconnectCountRef = useRef(0);
  const messageHandlers = useRef(new Map<string, (data: any) => void>());
  const subscriptionsRef = useRef<Set<string>>(new Set());

  // Get WebSocket URL
  const getWebSocketUrl = useCallback(() => {
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return url;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}${url}`;
  }, [url]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      setConnectionState('connecting');
      setError(null);

      const wsUrl = getWebSocketUrl();
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnectionState('connected');
        reconnectCountRef.current = 0;

        // Re-subscribe to channels
        if (subscriptionsRef.current.size > 0) {
          send({
            type: 'subscribe',
            channels: Array.from(subscriptionsRef.current),
          });
        }

        // Start heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          send({ type: 'ping' });
        }, heartbeatInterval);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          handleMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current.onclose = () => {
        setConnectionState('disconnected');
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Attempt to reconnect if not manually closed
        if (reconnectCountRef.current < reconnectAttempts) {
          setConnectionState('reconnecting');
          reconnectCountRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('Connection error');
        setConnectionState('error');
      };

    } catch (err) {
      setError('Failed to connect');
      setConnectionState('error');
    }
  }, [getWebSocketUrl, reconnectAttempts, reconnectInterval, heartbeatInterval]);

  // Send message
  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'welcome':
        if (message.recentEvents) {
          setEvents(message.recentEvents);
        }
        break;

      case 'event':
        setEvents(prev => {
          const newEvents = [message.data, ...prev].slice(0, 1000); // Keep last 1000 events
          return newEvents;
        });
        break;

      case 'subscribed':
        console.log('Subscribed to channels:', message.channels);
        break;

      case 'status':
      case 'error':
        // Handle status and error messages
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        // Handle custom message types
        const handler = messageHandlers.current.get(message.type);
        if (handler) {
          handler(message.data);
        }
    }
  }, []);

  // Subscribe to channels
  const subscribe = useCallback((channels: string | string[]) => {
    const channelArray = Array.isArray(channels) ? channels : [channels];
    channelArray.forEach(channel => subscriptionsRef.current.add(channel));

    if (connectionState === 'connected') {
      send({
        type: 'subscribe',
        channels: channelArray,
      });
    }
  }, [connectionState, send]);

  // Unsubscribe from channels
  const unsubscribe = useCallback((channels: string | string[]) => {
    const channelArray = Array.isArray(channels) ? channels : [channels];
    channelArray.forEach(channel => subscriptionsRef.current.delete(channel));

    if (connectionState === 'connected') {
      send({
        type: 'unsubscribe',
        channels: channelArray,
      });
    }
  }, [connectionState, send]);

  // Apply filters
  const setFilter = useCallback((filters: {
    eventTypes?: string[];
    userIds?: string[];
    sources?: string[];
    dateRange?: { start?: string; end?: string };
  }) => {
    send({
      type: 'filter',
      ...filters,
    });
  }, [send]);

  // Register message handler
  const onMessage = useCallback((messageType: string, handler: (data: any) => void) => {
    messageHandlers.current.set(messageType, handler);
    return () => messageHandlers.current.delete(messageType);
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    reconnectCountRef.current = reconnectAttempts; // Prevent reconnection
    wsRef.current?.close();
    setConnectionState('disconnected');
  }, [reconnectAttempts]);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionState,
    lastMessage,
    events,
    error,
    connect,
    disconnect,
    send,
    subscribe,
    unsubscribe,
    setFilter,
    onMessage,
    clearEvents,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting' || connectionState === 'reconnecting',
  };
}