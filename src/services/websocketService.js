const WebSocket = require('ws');
const logger = require('../utils/logger');

/**
 * WebSocket Service for real-time event streaming
 * Enables live event debugging and monitoring in the UI
 */
class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      clientTracking: true,
    });

    this.clients = new Map();
    this.eventBuffer = [];
    this.maxBufferSize = 1000;

    this.setupWebSocketServer();
    logger.info('WebSocket service initialized on /ws');
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientInfo = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastPing: Date.now(),
        connectedAt: new Date(),
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      };

      this.clients.set(clientId, clientInfo);

      logger.info(`WebSocket client connected: ${clientId}`);

      // Send welcome message with recent events
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId,
        recentEvents: this.eventBuffer.slice(-50), // Last 50 events
        timestamp: new Date().toISOString(),
      }));

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(clientId, data);
        } catch (error) {
          logger.error(`Invalid WebSocket message from ${clientId}:`, error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Heartbeat
      ws.on('pong', () => {
        if (this.clients.has(clientId)) {
          this.clients.get(clientId).lastPing = Date.now();
        }
      });
    });

    // Heartbeat interval to detect dead connections
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, clientId) => {
        if (now - client.lastPing > 30000) { // 30 seconds timeout
          logger.info(`Terminating inactive WebSocket client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
        } else {
          client.ws.ping();
        }
      });
    }, 15000);
  }

  handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case 'subscribe':
        this.handleSubscribe(client, data);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, data);
        break;
      case 'filter':
        this.handleFilter(client, data);
        break;
      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        logger.warn(`Unknown message type from ${clientId}: ${data.type}`);
    }
  }

  handleSubscribe(client, data) {
    const { channels = [] } = data;
    channels.forEach(channel => {
      client.subscriptions.add(channel);
    });

    client.ws.send(JSON.stringify({
      type: 'subscribed',
      channels: Array.from(client.subscriptions),
      timestamp: new Date().toISOString(),
    }));

    logger.debug(`Client ${client.id} subscribed to: ${channels.join(', ')}`);
  }

  handleUnsubscribe(client, data) {
    const { channels = [] } = data;
    channels.forEach(channel => {
      client.subscriptions.delete(channel);
    });

    client.ws.send(JSON.stringify({
      type: 'unsubscribed',
      channels,
      timestamp: new Date().toISOString(),
    }));
  }

  handleFilter(client, data) {
    // Store filters on the client object
    client.filters = {
      eventTypes: data.eventTypes || [],
      userIds: data.userIds || [],
      sources: data.sources || [],
      dateRange: data.dateRange,
    };

    client.ws.send(JSON.stringify({
      type: 'filter_applied',
      filters: client.filters,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Broadcast an event to all subscribed clients
   */
  broadcastEvent(eventData) {
    // Add to buffer for new connections
    this.eventBuffer.push({
      ...eventData,
      id: this.generateEventId(),
      receivedAt: new Date().toISOString(),
    });

    // Trim buffer if too large
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }

    const message = JSON.stringify({
      type: 'event',
      data: eventData,
      timestamp: new Date().toISOString(),
    });

    // Send to all connected clients
    this.clients.forEach((client, clientId) => {
      try {
        // Check if client is subscribed to events
        if (!client.subscriptions.has('events') && !client.subscriptions.has('all')) {
          return;
        }

        // Apply filters if any
        if (!this.passesFilters(eventData, client.filters)) {
          return;
        }

        // Send if connection is open
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      } catch (error) {
        logger.error(`Error sending event to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Broadcast system status updates
   */
  broadcastStatus(statusData) {
    const message = JSON.stringify({
      type: 'status',
      data: statusData,
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client, clientId) => {
      try {
        if (client.subscriptions.has('status') || client.subscriptions.has('all')) {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
          }
        }
      } catch (error) {
        logger.error(`Error sending status to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Send error notifications
   */
  broadcastError(errorData) {
    const message = JSON.stringify({
      type: 'error',
      data: errorData,
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client, clientId) => {
      try {
        if (client.subscriptions.has('errors') || client.subscriptions.has('all')) {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
          }
        }
      } catch (error) {
        logger.error(`Error sending error to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Check if event passes client filters
   */
  passesFilters(eventData, filters) {
    if (!filters) return true;

    // Event type filter
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      if (!filters.eventTypes.includes(eventData.event || eventData.eventType)) {
        return false;
      }
    }

    // User ID filter
    if (filters.userIds && filters.userIds.length > 0) {
      const userId = eventData.userId || eventData.user_id;
      if (!userId || !filters.userIds.includes(userId)) {
        return false;
      }
    }

    // Source filter
    if (filters.sources && filters.sources.length > 0) {
      if (!filters.sources.includes(eventData.platform || eventData.source)) {
        return false;
      }
    }

    // Date range filter
    if (filters.dateRange) {
      const eventDate = new Date(eventData.timestamp || eventData.created_at);
      if (filters.dateRange.start && eventDate < new Date(filters.dateRange.start)) {
        return false;
      }
      if (filters.dateRange.end && eventDate > new Date(filters.dateRange.end)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get connected clients info
   */
  getClientsInfo() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      subscriptions: Array.from(client.subscriptions),
      ip: client.ip,
      lastPing: new Date(client.lastPing),
    }));
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      bufferedEvents: this.eventBuffer.length,
      totalEventsSent: this.eventBuffer.length, // Simplified metric
    };
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    logger.info('Shutting down WebSocket service...');

    // Notify all clients
    const shutdownMessage = JSON.stringify({
      type: 'shutdown',
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client) => {
      try {
        client.ws.send(shutdownMessage);
        client.ws.close();
      } catch (error) {
        // Ignore errors during shutdown
      }
    });

    this.wss.close();
    this.clients.clear();
    this.eventBuffer = [];
  }

  // Helper methods

  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateEventId() {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = WebSocketService;