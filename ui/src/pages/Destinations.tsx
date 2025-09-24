import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Settings,
  Trash2,
  Check,
  X,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Database,
  MessageSquare,
  BarChart,
  Cloud,
  Link2,
  TestTube,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../utils/cn';

type DestinationType = 'slack' | 'mixpanel' | 'webhook' | 'database' | 'analytics' | 'crm';

type Destination = {
  id: string;
  name: string;
  type: DestinationType;
  status: 'active' | 'inactive' | 'error' | 'testing';
  enabled: boolean;
  eventsProcessed: number;
  lastSync?: string;
  errorRate: number;
  createdAt: string;
  config: {
    webhookUrl?: string;
    apiKey?: string;
    channel?: string;
    projectId?: string;
    filters?: {
      eventTypes?: string[];
      userProperties?: string[];
    };
    transformations?: string[];
  };
};

const destinationIcons = {
  slack: MessageSquare,
  mixpanel: BarChart,
  webhook: Link2,
  database: Database,
  analytics: Activity,
  crm: Cloud
};

const destinationLabels = {
  slack: 'Slack',
  mixpanel: 'Mixpanel',
  webhook: 'Webhook',
  database: 'Database',
  analytics: 'Analytics',
  crm: 'CRM'
};

const destinationColors = {
  slack: 'bg-purple-500',
  mixpanel: 'bg-blue-500',
  webhook: 'bg-gray-500',
  database: 'bg-green-500',
  analytics: 'bg-orange-500',
  crm: 'bg-pink-500'
};

export default function Destinations() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [testingDestination, setTestingDestination] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDestinations();
  }, []);

  const loadDestinations = async () => {
    try {
      // Mock data - replace with API call
      const mockDestinations: Destination[] = [
        {
          id: 'dest_1',
          name: 'Team Slack',
          type: 'slack',
          status: 'active',
          enabled: true,
          eventsProcessed: 12450,
          lastSync: new Date().toISOString(),
          errorRate: 0.01,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          config: {
            webhookUrl: 'https://hooks.slack.com/services/...',
            channel: '#events',
            filters: {
              eventTypes: ['user_signup', 'purchase_completed']
            }
          }
        },
        {
          id: 'dest_2',
          name: 'Analytics Platform',
          type: 'mixpanel',
          status: 'active',
          enabled: true,
          eventsProcessed: 45320,
          lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          errorRate: 0.02,
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          config: {
            apiKey: 'mp_abc123...',
            projectId: 'proj_123'
          }
        },
        {
          id: 'dest_3',
          name: 'Custom Webhook',
          type: 'webhook',
          status: 'error',
          enabled: true,
          eventsProcessed: 8900,
          lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          errorRate: 0.15,
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          config: {
            webhookUrl: 'https://api.example.com/events',
            transformations: ['custom_transform_1']
          }
        }
      ];

      setDestinations(mockDestinations);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load destinations:', error);
      setLoading(false);
    }
  };

  const handleAddDestination = (destination: Partial<Destination>) => {
    const newDestination: Destination = {
      id: `dest_${Date.now()}`,
      name: destination.name || 'New Destination',
      type: destination.type || 'webhook',
      status: 'inactive',
      enabled: false,
      eventsProcessed: 0,
      errorRate: 0,
      createdAt: new Date().toISOString(),
      config: destination.config || {}
    };

    setDestinations([...destinations, newDestination]);
    setShowAddModal(false);
  };

  const handleDeleteDestination = (id: string) => {
    if (confirm('Are you sure you want to delete this destination? This action cannot be undone.')) {
      setDestinations(destinations.filter(d => d.id !== id));
    }
  };

  const handleToggleDestination = (id: string) => {
    setDestinations(destinations.map(d =>
      d.id === id
        ? { ...d, enabled: !d.enabled, status: d.enabled ? 'inactive' : 'active' }
        : d
    ));
  };

  const handleTestDestination = async (id: string) => {
    setTestingDestination(id);
    // Simulate test
    setTimeout(() => {
      setTestingDestination(null);
      alert('Test event sent successfully!');
    }, 2000);
  };

  const getStatusIcon = (status: Destination['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'testing':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    }
  };

  const getHealthScore = (errorRate: number) => {
    if (errorRate < 0.01) return { label: 'Excellent', color: 'text-green-500' };
    if (errorRate < 0.05) return { label: 'Good', color: 'text-yellow-500' };
    if (errorRate < 0.1) return { label: 'Fair', color: 'text-orange-500' };
    return { label: 'Poor', color: 'text-red-500' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold cairo-gradient-text">Destinations</h1>
          <p className="text-muted-foreground mt-2">
            Configure where your customer data goes
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Destination
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Destinations</p>
              <p className="text-2xl font-bold">{destinations.length}</p>
            </div>
            <Send className="w-8 h-8 text-primary opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">
                {destinations.filter(d => d.status === 'active').length}
              </p>
            </div>
            <Zap className="w-8 h-8 text-green-500 opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Events Routed</p>
              <p className="text-2xl font-bold">
                {destinations.reduce((sum, d) => sum + d.eventsProcessed, 0).toLocaleString()}
              </p>
            </div>
            <Activity className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">With Errors</p>
              <p className="text-2xl font-bold">
                {destinations.filter(d => d.status === 'error').length}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* Destinations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Loading destinations...
          </div>
        ) : destinations.length === 0 ? (
          <div className="col-span-full">
            <div className="card p-8 text-center">
              <Send className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No destinations configured yet</p>
              <button onClick={() => setShowAddModal(true)} className="btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Destination
              </button>
            </div>
          </div>
        ) : (
          destinations.map(destination => {
            const Icon = destinationIcons[destination.type];
            const health = getHealthScore(destination.errorRate);

            return (
              <div key={destination.id} className="card hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-white",
                        destinationColors[destination.type]
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{destination.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {destinationLabels[destination.type]}
                        </p>
                      </div>
                    </div>
                    {getStatusIcon(destination.status)}
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Events Processed</span>
                      <span className="font-medium">{destination.eventsProcessed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Health</span>
                      <span className={cn("font-medium", health.color)}>
                        {health.label}
                      </span>
                    </div>
                    {destination.lastSync && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Last Sync</span>
                        <span>{format(new Date(destination.lastSync), 'HH:mm:ss')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 pt-4 border-t">
                    <button
                      onClick={() => handleTestDestination(destination.id)}
                      disabled={testingDestination === destination.id}
                      className="btn-outline btn-sm flex-1"
                    >
                      {testingDestination === destination.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedDestination(destination)}
                      className="btn-outline btn-sm flex-1"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleDestination(destination.id)}
                      className={cn(
                        "btn-sm",
                        destination.enabled ? "btn-outline" : "btn-primary"
                      )}
                    >
                      {destination.enabled ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteDestination(destination.id)}
                      className="btn-outline btn-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Destination Modal */}
      {showAddModal && (
        <AddDestinationModal
          onAdd={handleAddDestination}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Destination Settings Modal */}
      {selectedDestination && (
        <DestinationSettingsModal
          destination={selectedDestination}
          onSave={(updated) => {
            setDestinations(destinations.map(d =>
              d.id === updated.id ? updated : d
            ));
            setSelectedDestination(null);
          }}
          onClose={() => setSelectedDestination(null)}
        />
      )}
    </div>
  );
}

// Add Destination Modal Component
function AddDestinationModal({ onAdd, onClose }: {
  onAdd: (destination: Partial<Destination>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DestinationType>('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      name,
      type,
      config: {
        webhookUrl: type === 'webhook' || type === 'slack' ? webhookUrl : undefined,
        apiKey: type === 'mixpanel' ? apiKey : undefined,
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add New Destination</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Destination Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g., Team Slack"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Destination Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DestinationType)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {Object.entries(destinationLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {(type === 'webhook' || type === 'slack') && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {type === 'slack' ? 'Slack Webhook URL' : 'Webhook URL'}
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="https://..."
                required
              />
            </div>
          )}

          {type === 'mixpanel' && (
            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Your Mixpanel API key"
                required
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Destination
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Destination Settings Modal Component
function DestinationSettingsModal({ destination, onSave, onClose }: {
  destination: Destination;
  onSave: (destination: Destination) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState(destination.config);
  const [eventFilter, setEventFilter] = useState(
    destination.config.filters?.eventTypes?.join(', ') || ''
  );

  const handleSave = () => {
    onSave({
      ...destination,
      config: {
        ...config,
        filters: {
          ...config.filters,
          eventTypes: eventFilter ? eventFilter.split(',').map(e => e.trim()) : []
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Destination Settings</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <p className="text-lg">{destination.name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <p className="text-lg">{destinationLabels[destination.type]}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Event Type Filters (comma-separated)
            </label>
            <input
              type="text"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="user_signup, purchase_completed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to receive all events
            </p>
          </div>

          {destination.type === 'slack' && (
            <div>
              <label className="block text-sm font-medium mb-2">Slack Channel</label>
              <input
                type="text"
                value={config.channel || ''}
                onChange={(e) => setConfig({ ...config, channel: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="#general"
              />
            </div>
          )}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Statistics</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Events Processed:</span>
                <span className="ml-2 font-medium">{destination.eventsProcessed.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Error Rate:</span>
                <span className="ml-2 font-medium">{(destination.errorRate * 100).toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2 font-medium capitalize">{destination.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2 font-medium">
                  {format(new Date(destination.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}