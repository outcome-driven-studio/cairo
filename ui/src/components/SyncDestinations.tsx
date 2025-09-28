import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

interface Destination {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSync?: string;
  recordsSynced?: number;
  color: string;
}

interface SyncLog {
  id: string;
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
  destination?: string;
}

export function SyncDestinations() {
  const [destinations, setDestinations] = useState<Destination[]>([
    {
      id: 'mixpanel',
      name: 'Mixpanel',
      icon: '📊',
      enabled: true,
      status: 'idle',
      lastSync: '2 hours ago',
      recordsSynced: 5298,
      color: 'from-purple-500 to-pink-500'
    },
    {
      id: 'attio',
      name: 'Attio',
      icon: '🎯',
      enabled: true,
      status: 'idle',
      lastSync: '1 hour ago',
      recordsSynced: 5298,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      icon: '🚀',
      enabled: false,
      status: 'idle',
      color: 'from-orange-500 to-red-500'
    },
    {
      id: 'salesforce',
      name: 'Salesforce',
      icon: '☁️',
      enabled: false,
      status: 'idle',
      color: 'from-blue-600 to-indigo-600'
    },
    {
      id: 'segment',
      name: 'Segment',
      icon: '📡',
      enabled: false,
      status: 'idle',
      color: 'from-green-500 to-teal-500'
    },
    {
      id: 'amplitude',
      name: 'Amplitude',
      icon: '📈',
      enabled: false,
      status: 'idle',
      color: 'from-indigo-500 to-purple-500'
    }
  ]);

  const [syncing, setSyncing] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [uptime, setUptime] = useState(99.97);

  useEffect(() => {
    // Simulate real-time logs
    if (syncing) {
      const interval = setInterval(() => {
        const newLog: SyncLog = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          message: getRandomLogMessage(),
          level: Math.random() > 0.8 ? 'warning' : 'info',
          destination: selectedDestination || undefined
        };
        setLogs(prev => [newLog, ...prev].slice(0, 50));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [syncing, selectedDestination]);

  const getRandomLogMessage = () => {
    const messages = [
      'Fetching user data batch...',
      'Processing enrichment profiles...',
      'Validating data consistency...',
      'Syncing lead scores...',
      'Updating user properties...',
      'Batching events for transmission...',
      'Applying data transformations...',
      'Checking rate limits...',
      'Optimizing payload size...',
      'Verifying API credentials...'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const handleSync = async (destinationId: string) => {
    setSyncing(true);
    setSelectedDestination(destinationId);
    setShowLogs(true);

    // Update destination status
    setDestinations(prev => prev.map(d =>
      d.id === destinationId ? { ...d, status: 'syncing' } : d
    ));

    // Add initial log
    const startLog: SyncLog = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      message: `Starting sync to ${destinations.find(d => d.id === destinationId)?.name}...`,
      level: 'info',
      destination: destinationId
    };
    setLogs(prev => [startLog, ...prev]);

    try {
      // Call background sync API endpoint - continues even if tab is closed
      const response = await axios.post(`/api/sync/${destinationId}/background`, {
        fullSync: true
      });

      // Add log about background processing
      const bgLog: SyncLog = {
        id: (Date.now() + 1).toString(),
        timestamp: new Date().toISOString(),
        message: `Background sync initiated. Processing continues even if you close this tab.`,
        level: 'info',
        destination: destinationId
      };
      setLogs(prev => [bgLog, ...prev]);

      // Update UI to show processing
      setTimeout(() => {
        setDestinations(prev => prev.map(d =>
          d.id === destinationId
            ? {
                ...d,
                status: 'success',
                lastSync: 'Processing in background...',
                recordsSynced: 0
              }
            : d
        ));

        const successLog: SyncLog = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          message: `Background sync started. Check server logs for progress.`,
          level: 'success',
          destination: destinationId
        };
        setLogs(prev => [successLog, ...prev]);

        setSyncing(false);
        setSelectedDestination(null);
      }, 2000);

    } catch (error) {
      setDestinations(prev => prev.map(d =>
        d.id === destinationId ? { ...d, status: 'error' } : d
      ));

      const errorLog: SyncLog = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        level: 'error',
        destination: destinationId
      };
      setLogs(prev => [errorLog, ...prev]);

      setSyncing(false);
      setSelectedDestination(null);
    }
  };

  const toggleDestination = (destinationId: string) => {
    setDestinations(prev => prev.map(d =>
      d.id === destinationId ? { ...d, enabled: !d.enabled } : d
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900">Sync Destinations</h1>
          <p className="text-gray-500 mt-2">Manage and sync data to your connected platforms</p>
        </div>

        {/* Status Bar */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${syncing ? 'bg-yellow-400' : 'bg-green-400'}`}>
                {syncing && (
                  <span className="absolute inset-0 rounded-full bg-yellow-400 animate-ping" />
                )}
              </div>
            </div>
            <span className="text-sm text-gray-600">
              System Status: {syncing ? 'Syncing' : 'Operational'}
            </span>
          </div>
          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <div>Uptime: {uptime}%</div>
            <div>Last sync: 2 minutes ago</div>
            <div>Total records: 5,298</div>
          </div>
        </div>

        {/* Destinations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {destinations.map((destination) => (
            <motion.div
              key={destination.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className={`h-1 bg-gradient-to-r ${destination.color}`} />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{destination.icon}</span>
                    <div>
                      <h3 className="font-medium text-gray-900">{destination.name}</h3>
                      {destination.lastSync && (
                        <p className="text-xs text-gray-500">Last sync: {destination.lastSync}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleDestination(destination.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      destination.enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        destination.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {destination.recordsSynced && (
                  <div className="text-sm text-gray-600 mb-4">
                    {destination.recordsSynced.toLocaleString()} records synced
                  </div>
                )}

                <button
                  onClick={() => handleSync(destination.id)}
                  disabled={!destination.enabled || syncing}
                  className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    destination.enabled && !syncing
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {destination.status === 'syncing' ? (
                    <span className="flex items-center justify-center space-x-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Syncing...</span>
                    </span>
                  ) : (
                    'Sync Now'
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Logs Section */}
        <AnimatePresence>
          {showLogs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gray-900 rounded-xl overflow-hidden"
            >
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white font-medium">Sync Logs</h3>
                <button
                  onClick={() => setShowLogs(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="relative h-64 overflow-hidden">
                {/* Fade overlays */}
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-gray-900 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-gray-900 to-transparent z-10 pointer-events-none" />

                {/* Scrollable logs */}
                <div className="h-full overflow-y-auto px-4 py-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
                  {logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="font-mono text-xs"
                    >
                      <span className="text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`ml-2 ${
                        log.level === 'error' ? 'text-red-400' :
                        log.level === 'warning' ? 'text-yellow-400' :
                        log.level === 'success' ? 'text-green-400' :
                        'text-gray-400'
                      }`}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="ml-2 text-gray-300">{log.message}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}