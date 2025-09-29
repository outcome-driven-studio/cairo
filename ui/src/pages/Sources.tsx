import React, { useState, useEffect } from 'react';
import {
  Database,
  Plus,
  Settings,
  Trash2,
  Edit,
  Check,
  X,
  Code,
  Globe,
  Smartphone,
  Server,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../utils/cn';

type SourceType = 'javascript' | 'nodejs' | 'react' | 'mobile' | 'server' | 'http';

type Source = {
  id: string;
  name: string;
  type: SourceType;
  writeKey: string;
  status: 'active' | 'inactive' | 'error';
  lastSeen?: string;
  eventCount: number;
  createdAt: string;
  settings: {
    allowedDomains?: string[];
    allowedIPs?: string[];
    rateLimit?: number;
    enabled: boolean;
  };
};

const sourceTypeIcons = {
  javascript: Globe,
  nodejs: Server,
  react: Code,
  mobile: Smartphone,
  server: Server,
  http: Activity
};

const sourceTypeLabels = {
  javascript: 'JavaScript/Browser',
  nodejs: 'Node.js',
  react: 'React/Next.js',
  mobile: 'Mobile App',
  server: 'Server-side',
  http: 'HTTP API'
};

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const response = await fetch('/api/config/sources');
      if (!response.ok) {
        throw new Error('Failed to fetch sources');
      }
      const data = await response.json();
      setSources(data.sources || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load sources:', error);
      setSources([]);
      setLoading(false);
    }
  };

  const handleAddSource = (source: Partial<Source>) => {
    const newSource: Source = {
      id: `src_${Date.now()}`,
      name: source.name || 'New Source',
      type: source.type || 'javascript',
      writeKey: `wk_${source.type}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'inactive',
      eventCount: 0,
      createdAt: new Date().toISOString(),
      settings: {
        enabled: true,
        ...source.settings
      }
    };

    setSources([...sources, newSource]);
    setShowAddModal(false);
  };

  const handleDeleteSource = (id: string) => {
    if (confirm('Are you sure you want to delete this source? This action cannot be undone.')) {
      setSources(sources.filter(s => s.id !== id));
    }
  };

  const handleToggleSource = (id: string) => {
    setSources(sources.map(s =>
      s.id === id
        ? { ...s, settings: { ...s.settings, enabled: !s.settings.enabled }, status: s.settings.enabled ? 'inactive' : 'active' }
        : s
    ));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, show a toast notification
  };

  const getStatusIcon = (status: Source['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold cairo-gradient-text">Sources</h1>
          <p className="text-muted-foreground mt-2">
            Manage where your customer data comes from
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Source
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Sources</p>
              <p className="text-2xl font-bold">{sources.length}</p>
            </div>
            <Database className="w-8 h-8 text-primary opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Sources</p>
              <p className="text-2xl font-bold">{sources.filter(s => s.status === 'active').length}</p>
            </div>
            <Activity className="w-8 h-8 text-green-500 opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">
                {sources.reduce((sum, s) => sum + s.eventCount, 0).toLocaleString()}
              </p>
            </div>
            <Server className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Error Sources</p>
              <p className="text-2xl font-bold">{sources.filter(s => s.status === 'error').length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* Sources List */}
      <div className="card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Configured Sources</h2>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading sources...
            </div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center">
              <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No sources configured yet</p>
              <button onClick={() => setShowAddModal(true)} className="btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Source
              </button>
            </div>
          ) : (
            sources.map(source => {
              const Icon = sourceTypeIcons[source.type];
              return (
                <div key={source.id} className="p-6 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold">{source.name}</h3>
                          {getStatusIcon(source.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {sourceTypeLabels[source.type]} • {source.eventCount.toLocaleString()} events
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedSource(source)}
                        className="btn-outline btn-sm"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingSource(source.id)}
                        className="btn-outline btn-sm"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleSource(source.id)}
                        className={cn(
                          "btn-sm",
                          source.settings.enabled ? "btn-outline" : "btn-primary"
                        )}
                      >
                        {source.settings.enabled ? (
                          <X className="w-4 h-4" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="btn-outline btn-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {source.lastSeen && (
                    <div className="mt-3 flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>Last seen: {format(new Date(source.lastSeen), 'MMM d, HH:mm')}</span>
                      <span>•</span>
                      <span>Created: {format(new Date(source.createdAt), 'MMM d, yyyy')}</span>
                      {source.settings.rateLimit && (
                        <>
                          <span>•</span>
                          <span>Rate limit: {source.settings.rateLimit}/min</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <AddSourceModal
          onAdd={handleAddSource}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Source Details Modal */}
      {selectedSource && (
        <SourceDetailsModal
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
}

// Add Source Modal Component
function AddSourceModal({ onAdd, onClose }: {
  onAdd: (source: Partial<Source>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('javascript');
  const [allowedDomains, setAllowedDomains] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      name,
      type,
      settings: {
        allowedDomains: allowedDomains ? allowedDomains.split(',').map(d => d.trim()) : [],
        enabled: true
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add New Source</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Source Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g., Production Website"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Source Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SourceType)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {Object.entries(sourceTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {type === 'javascript' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Allowed Domains (comma-separated)
              </label>
              <input
                type="text"
                value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="*.myapp.com, myapp.com"
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Source Details Modal Component
function SourceDetailsModal({ source, onClose }: {
  source: Source;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getIntegrationCode = () => {
    switch (source.type) {
      case 'javascript':
        return `<script>
  !function(){var analytics=window.analytics=window.analytics||[];
  analytics.load=function(key){/* ... */};
  analytics.track=function(){/* ... */};}();

  analytics.load('${source.writeKey}');
  analytics.track('Page Viewed');
</script>`;

      case 'nodejs':
        return `const { CairoClient } = require('@cairo/node-sdk');

const cairo = new CairoClient({
  writeKey: '${source.writeKey}',
  host: '${window.location.origin}'
});

cairo.track('Event Name', {
  property: 'value'
}, { userId: 'user123' });`;

      case 'react':
        return `import { CairoProvider } from '@cairo/react-sdk';

function App() {
  return (
    <CairoProvider
      writeKey="${source.writeKey}"
      config={{ host: '${window.location.origin}' }}
    >
      <YourApp />
    </CairoProvider>
  );
}`;

      default:
        return `POST ${window.location.origin}/api/events/track
Authorization: Bearer ${source.writeKey}
Content-Type: application/json

{
  "event": "Event Name",
  "properties": { "key": "value" },
  "userId": "user123"
}`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Integration Instructions</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Source Name</label>
            <p className="text-lg">{source.name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Write Key</label>
            <div className="flex items-center space-x-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded font-mono text-sm">
                {source.writeKey}
              </code>
              <button
                onClick={() => copyToClipboard(source.writeKey)}
                className="btn-outline btn-sm"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Integration Code</label>
            <div className="relative">
              <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
                <code>{getIntegrationCode()}</code>
              </pre>
              <button
                onClick={() => copyToClipboard(getIntegrationCode())}
                className="absolute top-2 right-2 btn-outline btn-sm"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Quick Start</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Copy the integration code above</li>
              <li>Add it to your application</li>
              <li>Replace placeholder values with your actual data</li>
              <li>Start tracking events</li>
            </ol>
          </div>

          <div className="flex justify-between pt-4">
            <a
              href="/docs"
              target="_blank"
              className="btn-outline btn-sm"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Documentation
            </a>
            <button onClick={onClose} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}