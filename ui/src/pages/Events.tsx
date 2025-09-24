import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Filter,
  Search,
  Download,
  Settings,
  Circle,
  AlertCircle,
  CheckCircle,
  Clock,
  Code,
  User,
  Globe
} from 'lucide-react';
import { format } from 'date-fns';
import { useWebSocket } from '../hooks/useWebSocket';
import { cn } from '../utils/cn';

type EventData = {
  id?: string;
  event: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, any>;
  context?: Record<string, any>;
  timestamp: string;
  platform?: string;
  source?: string;
  messageId?: string;
  receivedAt?: string;
};

type FilterState = {
  search: string;
  eventTypes: string[];
  userIds: string[];
  sources: string[];
  dateRange: { start?: string; end?: string };
};

export default function Events() {
  const [isLive, setIsLive] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    eventTypes: [],
    userIds: [],
    sources: [],
    dateRange: {}
  });
  const [showFilters, setShowFilters] = useState(false);

  const {
    connectionState,
    events,
    connect,
    disconnect,
    subscribe,
    setFilter,
    clearEvents,
    isConnected
  } = useWebSocket();

  useEffect(() => {
    if (isConnected) {
      subscribe(['events', 'all']);
    }
  }, [isConnected, subscribe]);

  useEffect(() => {
    if (isConnected) {
      setFilter(filters);
    }
  }, [filters, isConnected, setFilter]);

  const handleToggleLive = () => {
    if (isLive) {
      disconnect();
    } else {
      connect();
    }
    setIsLive(!isLive);
  };

  const handleClearEvents = () => {
    clearEvents();
  };

  const handleExportEvents = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `cairo-events-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleApplyFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
    setShowFilters(false);
  };

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'reconnecting': return 'text-orange-500';
      case 'disconnected': return 'text-gray-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return <CheckCircle className="w-4 h-4" />;
      case 'connecting': case 'reconnecting': return <Clock className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  const filteredEvents = events.filter(event => {
    if (filters.search && !JSON.stringify(event).toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const uniqueEventTypes = [...new Set(events.map(e => e.event).filter(Boolean))];
  const uniqueSources = [...new Set(events.map(e => e.platform || e.source).filter(Boolean))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold cairo-gradient-text">Live Events</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and debug events in real-time
          </p>
        </div>
        <div className={cn("flex items-center space-x-2", getConnectionStatusColor())}>
          {getConnectionStatusIcon()}
          <span className="text-sm font-medium capitalize">{connectionState}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleToggleLive}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
                isLive
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              {isLive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isLive ? 'Pause' : 'Resume'}</span>
            </button>

            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Circle className="w-2 h-2 fill-current" />
              <span>{events.length} events</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search events..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10 pr-4 py-2 border rounded-lg bg-background text-foreground placeholder-muted-foreground"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "btn-outline",
                showFilters && "bg-primary text-primary-foreground"
              )}
            >
              <Filter className="w-4 h-4" />
            </button>

            <button onClick={handleExportEvents} className="btn-outline">
              <Download className="w-4 h-4" />
            </button>

            <button onClick={handleClearEvents} className="btn-outline text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Event Types</label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {uniqueEventTypes.map(eventType => (
                    <label key={eventType} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={filters.eventTypes.includes(eventType)}
                        onChange={(e) => {
                          const newTypes = e.target.checked
                            ? [...filters.eventTypes, eventType]
                            : filters.eventTypes.filter(t => t !== eventType);
                          setFilters(prev => ({ ...prev, eventTypes: newTypes }));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{eventType}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Sources</label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {uniqueSources.map(source => (
                    <label key={source} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={filters.sources.includes(source)}
                        onChange={(e) => {
                          const newSources = e.target.checked
                            ? [...filters.sources, source]
                            : filters.sources.filter(s => s !== source);
                          setFilters(prev => ({ ...prev, sources: newSources }));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{source}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Date Range</label>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={filters.dateRange.start || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, start: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border rounded text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={filters.dateRange.end || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, end: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Events List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Event Stream</h3>
          <div className="card p-0 h-96 overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Circle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No events yet</p>
                  <p className="text-sm">Events will appear here in real-time</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredEvents.map((event, index) => (
                  <div
                    key={event.id || index}
                    onClick={() => setSelectedEvent(event)}
                    className={cn(
                      "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                      selectedEvent === event && "bg-primary/10 border-r-2 border-primary"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                        <span className="font-medium">{event.event}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(event.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      {event.userId && (
                        <div className="flex items-center space-x-1">
                          <User className="w-3 h-3" />
                          <span>{event.userId}</span>
                        </div>
                      )}
                      {(event.platform || event.source) && (
                        <div className="flex items-center space-x-1">
                          <Globe className="w-3 h-3" />
                          <span>{event.platform || event.source}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Event Details</h3>
          <div className="card p-0 h-96 overflow-y-auto">
            {selectedEvent ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-lg">{selectedEvent.event}</h4>
                  <button className="btn-outline btn-sm">
                    <Code className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                    <p className="text-sm mt-1">{format(new Date(selectedEvent.timestamp), 'PPpp')}</p>
                  </div>

                  {selectedEvent.userId && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">User ID</label>
                      <p className="text-sm mt-1">{selectedEvent.userId}</p>
                    </div>
                  )}

                  {selectedEvent.anonymousId && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Anonymous ID</label>
                      <p className="text-sm mt-1 font-mono text-xs">{selectedEvent.anonymousId}</p>
                    </div>
                  )}

                  {selectedEvent.messageId && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Message ID</label>
                      <p className="text-sm mt-1 font-mono text-xs">{selectedEvent.messageId}</p>
                    </div>
                  )}

                  {selectedEvent.properties && Object.keys(selectedEvent.properties).length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Properties</label>
                      <pre className="text-xs mt-1 p-3 bg-muted rounded-lg overflow-x-auto">
{JSON.stringify(selectedEvent.properties, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedEvent.context && Object.keys(selectedEvent.context).length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Context</label>
                      <pre className="text-xs mt-1 p-3 bg-muted rounded-lg overflow-x-auto">
{JSON.stringify(selectedEvent.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select an event</p>
                  <p className="text-sm">Click on an event to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}