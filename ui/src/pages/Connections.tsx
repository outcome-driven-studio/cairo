import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Database, Zap, Plus, Trash2, Power, PowerOff, ArrowRight, Check, Settings, Code } from 'lucide-react';

interface Source {
  id: string;
  name: string;
  type: string;
  write_key: string;
  enabled: boolean;
  event_count?: number;
}

interface Destination {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface Transformation {
  id: string;
  name: string;
  enabled: boolean;
  source: {
    id: string;
    name: string;
    type: string;
  };
  destination: {
    id: string;
    name: string;
    type: string;
  };
}

interface SourcesData {
  success: boolean;
  sources: Source[];
}

interface DestinationsData {
  success: boolean;
  destinations: Destination[];
}

interface TransformationsData {
  success: boolean;
  transformations: Transformation[];
}

interface SourceTypeDef {
  type: string;
  name: string;
  description?: string;
  icon: string;
  fields?: { name: string; type: string; required?: boolean; label: string }[];
}

interface DestinationTypeDef {
  type: string;
  name: string;
  description?: string;
  icon: string;
  fields?: { name: string; type: string; required?: boolean; label: string; options?: string[] }[];
}

const getIcon = (type: string) => {
  const typeIcons: Record<string, string> = {
    javascript: '🌐',
    nodejs: '🟢',
    react: '⚛️',
    slack: '💬',
    discord: '🎮',
    mixpanel: '📊',
    webhook: '🔗',
    resend: '📧',
    database: '🗄️',
  };
  return typeIcons[type.toLowerCase()] || '📦';
};

const getGradient = (type: string) => {
  const gradients: Record<string, string> = {
    javascript: 'from-yellow-500 to-orange-500',
    nodejs: 'from-green-500 to-emerald-600',
    react: 'from-cyan-500 to-blue-600',
    slack: 'from-purple-500 to-pink-500',
    discord: 'from-indigo-500 to-purple-600',
    mixpanel: 'from-blue-500 to-purple-600',
    webhook: 'from-gray-500 to-gray-700',
    resend: 'from-emerald-500 to-teal-600',
    database: 'from-indigo-500 to-purple-600',
  };
  return gradients[type.toLowerCase()] || 'from-gray-500 to-gray-600';
};

const SourceCard = ({ source, onToggle }: { source: Source; onToggle: (id: string, enabled: boolean) => void }) => (
  <div className="group relative overflow-hidden rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
    <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(source.type)} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
    
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getGradient(source.type)} flex items-center justify-center text-2xl`}>
            {getIcon(source.type)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{source.name}</h3>
            <p className="text-sm text-gray-400 font-mono">{source.type}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(source.id, !source.enabled)}
          className={`p-2 rounded-lg transition-colors ${
            source.enabled
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          }`}
        >
          {source.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Write Key</span>
          <code className="text-cyan-400 bg-black/30 px-2 py-1 rounded font-mono text-xs">
            {source.write_key.substring(0, 20)}...
          </code>
        </div>
        {source.event_count !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Events Received</span>
            <span className="text-white font-bold">{source.event_count.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

const DestinationCard = ({ destination, onToggle }: { destination: Destination; onToggle: (id: string, enabled: boolean) => void }) => (
  <div className="group relative overflow-hidden rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
    <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(destination.type)} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
    
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getGradient(destination.type)} flex items-center justify-center text-2xl`}>
            {getIcon(destination.type)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{destination.name}</h3>
            <p className="text-sm text-gray-400 font-mono">{destination.type}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(destination.id, !destination.enabled)}
          className={`p-2 rounded-lg transition-colors ${
            destination.enabled
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          }`}
        >
          {destination.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex items-center space-x-2">
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          destination.enabled
            ? 'bg-green-500/20 text-green-400'
            : 'bg-gray-500/20 text-gray-400'
        }`}>
          {destination.enabled ? 'Active' : 'Disabled'}
        </div>
      </div>
    </div>
  </div>
);

const ConnectionRow = ({ 
  transformation, 
  onToggle, 
  onDelete 
}: { 
  transformation: Transformation; 
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="group relative overflow-hidden rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    
    <div className="relative z-10 flex items-center justify-between">
      <div className="flex items-center space-x-6 flex-1">
        {/* Source */}
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(transformation.source.type)} flex items-center justify-center text-xl`}>
            {getIcon(transformation.source.type)}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{transformation.source.name}</p>
            <p className="text-xs text-gray-500">{transformation.source.type}</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center space-x-2">
          <div className="h-px w-12 bg-gradient-to-r from-cyan-400 to-blue-500" />
          <ArrowRight className="w-5 h-5 text-cyan-400" />
          <div className="h-px w-12 bg-gradient-to-r from-blue-500 to-purple-600" />
        </div>

        {/* Destination */}
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(transformation.destination.type)} flex items-center justify-center text-xl`}>
            {getIcon(transformation.destination.type)}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{transformation.destination.name}</p>
            <p className="text-xs text-gray-500">{transformation.destination.type}</p>
          </div>
        </div>

        {/* Name */}
        <div className="flex-1">
          <p className="text-sm text-gray-300">{transformation.name}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onToggle(transformation.id, !transformation.enabled)}
          className={`p-2 rounded-lg transition-colors ${
            transformation.enabled
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          }`}
        >
          {transformation.enabled ? <Check className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onDelete(transformation.id)}
          className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
);

function AddSourceModal({
  sourceTypes,
  getIcon,
  onCreate,
  onClose,
  error,
  isPending,
}: {
  sourceTypes: SourceTypeDef[];
  getIcon: (type: string) => string;
  onCreate: (payload: { name: string; type: string; settings?: Record<string, unknown> }) => Promise<unknown>;
  onClose: () => void;
  error?: string;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const types = sourceTypes.length > 0 ? sourceTypes : [{ type: 'javascript', name: 'JavaScript/Browser', icon: '🌐', fields: [{ name: 'allowedDomains', type: 'text', required: false, label: 'Allowed Domains (comma-separated)' }] }];
  const selectedTypeDef = types.find(t => t.type === type) || types[0];
  const effectiveType = type || (types[0]?.type ?? 'javascript');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const settings: Record<string, unknown> = {};
    (selectedTypeDef?.fields || []).forEach(f => {
      const v = fieldValues[f.name];
      if (f.name === 'allowedDomains' && typeof v === 'string') {
        settings[f.name] = v ? v.split(',').map(s => s.trim()) : [];
      } else if (v !== undefined && v !== '') {
        settings[f.name] = v;
      }
    });
    await onCreate({ name: name || 'New Source', type: effectiveType, settings });
    setName('');
    setType(types[0]?.type ?? '');
    setFieldValues({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="backdrop-blur-xl bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Add Source</h3>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Website"
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Type</label>
            <select
              value={effectiveType}
              onChange={(e) => { setType(e.target.value); setFieldValues({}); }}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-cyan-400 focus:outline-none"
            >
              {types.map(st => (
                <option key={st.type} value={st.type}>{getIcon(st.type)} {st.name}</option>
              ))}
            </select>
          </div>
          {(selectedTypeDef?.fields || []).map(f => (
            <div key={f.name}>
              <label className="block text-sm text-gray-400 mb-2">{f.label}</label>
              <input
                type={f.type === 'url' ? 'url' : 'text'}
                value={fieldValues[f.name] ?? ''}
                onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                placeholder={f.label}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          ))}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium disabled:opacity-50">
              {isPending ? 'Creating...' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddDestinationModal({
  destinationTypes,
  getIcon,
  onCreate,
  onClose,
  error,
  isPending,
}: {
  destinationTypes: DestinationTypeDef[];
  getIcon: (type: string) => string;
  onCreate: (payload: { name: string; type: string; settings?: Record<string, unknown>; enabled?: boolean }) => Promise<unknown>;
  onClose: () => void;
  error?: string;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<DestinationTypeDef | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const handleTypeSelect = (t: DestinationTypeDef) => {
    setSelectedType(t);
    setFieldValues({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    const settings: Record<string, unknown> = {};
    (selectedType.fields || []).forEach(f => {
      const v = fieldValues[f.name];
      if (v === undefined || v === '') {
        if (f.required) settings[f.name] = '';
        return;
      }
      if (f.type === 'number') settings[f.name] = Number(v);
      else if (f.type === 'tags' && typeof v === 'string') settings[f.name] = v ? v.split(',').map(s => s.trim()) : [];
      else settings[f.name] = v;
    });
    await onCreate({ name: name || selectedType.name, type: selectedType.type, settings, enabled: true });
    setName('');
    setSelectedType(null);
    setFieldValues({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="backdrop-blur-xl bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-white mb-4">Add Destination</h3>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}
        {!selectedType ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm mb-4">Choose a destination type</p>
            {destinationTypes.map(dt => (
              <button
                key={dt.type}
                type="button"
                onClick={() => handleTypeSelect(dt)}
                className="w-full flex items-center space-x-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-left"
              >
                <span className="text-2xl">{getIcon(dt.type)}</span>
                <div>
                  <p className="font-medium text-white">{dt.name}</p>
                  <p className="text-sm text-gray-500">{dt.description}</p>
                </div>
              </button>
            ))}
            <div className="flex justify-end pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <button type="button" onClick={() => setSelectedType(null)} className="text-sm text-cyan-400 hover:underline mb-2">
              ← Back to types
            </button>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. My ${selectedType.name}`}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                required
              />
            </div>
            {(selectedType.fields || []).map(f => (
              <div key={f.name}>
                <label className="block text-sm text-gray-400 mb-2">{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'select' && f.options ? (
                  <select
                    value={fieldValues[f.name] ?? ''}
                    onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : 'text'}
                    value={fieldValues[f.name] ?? ''}
                    onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                    placeholder={f.label}
                    required={f.required}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={() => setSelectedType(null)} className="px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30">
                Back
              </button>
              <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium disabled:opacity-50">
                {isPending ? 'Creating...' : 'Create Destination'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Connections() {
  const queryClient = useQueryClient();
  const [showNewConnection, setShowNewConnection] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showAddDestinationModal, setShowAddDestinationModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [connectionName, setConnectionName] = useState('');

  // Fetch data
  const { data: sourcesData } = useQuery<SourcesData>({
    queryKey: ['sources'],
    queryFn: async () => {
      const response = await axios.get('/api/config/sources');
      return response.data;
    },
  });

  const { data: sourceTypesData } = useQuery<{ success: boolean; types: SourceTypeDef[] }>({
    queryKey: ['source-types'],
    queryFn: async () => {
      const response = await axios.get('/api/config/source-types');
      return response.data;
    },
    enabled: showAddSourceModal,
  });

  const { data: destinationsData } = useQuery<DestinationsData>({
    queryKey: ['destinations'],
    queryFn: async () => {
      const response = await axios.get('/api/config/destinations');
      return response.data;
    },
  });

  const { data: destinationTypesData } = useQuery<{ success: boolean; types: DestinationTypeDef[] }>({
    queryKey: ['destination-types'],
    queryFn: async () => {
      const response = await axios.get('/api/config/destination-types');
      return response.data;
    },
    enabled: showAddDestinationModal,
  });

  const { data: transformationsData } = useQuery<TransformationsData>({
    queryKey: ['transformations'],
    queryFn: async () => {
      const response = await axios.get('/api/config/transformations');
      return response.data;
    },
  });

  // Mutations
  const toggleSourceMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await axios.put(`/api/config/sources/${id}`, { enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const toggleDestinationMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await axios.put(`/api/config/destinations/${id}`, { enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['destinations'] }),
  });

  const toggleTransformationMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await axios.put(`/api/config/transformations/${id}`, { enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transformations'] }),
  });

  const createTransformationMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/config/transformations', {
        name: connectionName || `${selectedSource} → ${selectedDestination}`,
        source_id: selectedSource,
        destination_id: selectedDestination,
        enabled: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transformations'] });
      setShowNewConnection(false);
      setSelectedSource('');
      setSelectedDestination('');
      setConnectionName('');
    },
  });

  const deleteTransformationMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/config/transformations/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transformations'] }),
  });

  const createSourceMutation = useMutation({
    mutationFn: async (payload: { name: string; type: string; settings?: Record<string, unknown> }) => {
      const { data } = await axios.post('/api/config/sources', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setShowAddSourceModal(false);
    },
  });

  const createDestinationMutation = useMutation({
    mutationFn: async (payload: { name: string; type: string; settings?: Record<string, unknown>; enabled?: boolean }) => {
      const { data } = await axios.post('/api/config/destinations', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      setShowAddDestinationModal(false);
    },
  });

  const sources = sourcesData?.sources || [];
  const destinations = destinationsData?.destinations || [];
  const transformations = transformationsData?.transformations || [];
  const sourceTypes = sourceTypesData?.types || [];
  const destinationTypes = destinationTypesData?.types || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Connections
          </h1>
          <p className="text-gray-400">Connect sources to destinations • Segment/RudderStack style</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Sources</p>
                <p className="text-3xl font-bold text-white mt-1">{sources.length}</p>
              </div>
              <Database className="w-12 h-12 text-cyan-400 opacity-50" />
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Destinations</p>
                <p className="text-3xl font-bold text-white mt-1">{destinations.length}</p>
              </div>
              <Zap className="w-12 h-12 text-purple-400 opacity-50" />
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Active Connections</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {transformations.filter(t => t.enabled).length}
                </p>
              </div>
              <ArrowRight className="w-12 h-12 text-emerald-400 opacity-50" />
            </div>
          </div>
        </div>

        {/* Sources Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Database className="w-6 h-6 mr-2 text-cyan-400" />
              Sources
            </h2>
            <button
              onClick={() => setShowAddSourceModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-600 hover:to-blue-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Add Source</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map(source => (
              <SourceCard
                key={source.id}
                source={source}
                onToggle={(id, enabled) => toggleSourceMutation.mutate({ id, enabled })}
              />
            ))}
          </div>
        </div>

        {/* Add Source Modal */}
        {showAddSourceModal && (
          <AddSourceModal
            sourceTypes={sourceTypes}
            getIcon={getIcon}
            onCreate={(payload) => createSourceMutation.mutateAsync(payload)}
            onClose={() => setShowAddSourceModal(false)}
            error={createSourceMutation.error ? (createSourceMutation.error as Error).message : undefined}
            isPending={createSourceMutation.isPending}
          />
        )}

        {/* Destinations Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Zap className="w-6 h-6 mr-2 text-purple-400" />
              Destinations
            </h2>
            <button
              onClick={() => setShowAddDestinationModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium hover:from-purple-600 hover:to-pink-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Add Destination</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {destinations.map(destination => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                onToggle={(id, enabled) => toggleDestinationMutation.mutate({ id, enabled })}
              />
            ))}
          </div>
        </div>

        {/* Add Destination Modal */}
        {showAddDestinationModal && (
          <AddDestinationModal
            destinationTypes={destinationTypes}
            getIcon={getIcon}
            onCreate={(payload) => createDestinationMutation.mutateAsync(payload)}
            onClose={() => setShowAddDestinationModal(false)}
            error={createDestinationMutation.error ? (createDestinationMutation.error as Error).message : undefined}
            isPending={createDestinationMutation.isPending}
          />
        )}

        {/* Connections Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <ArrowRight className="w-6 h-6 mr-2 text-emerald-400" />
              Active Connections
            </h2>
            <button
              onClick={() => setShowNewConnection(!showNewConnection)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-600 hover:to-blue-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>New Connection</span>
            </button>
          </div>

          {showNewConnection && (
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-4">
              <h3 className="text-lg font-bold text-white mb-4">Create New Connection</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Source</label>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">Select source...</option>
                    {sources.filter(s => s.enabled).map(source => (
                      <option key={source.id} value={source.id}>
                        {getIcon(source.type)} {source.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Destination</label>
                  <select
                    value={selectedDestination}
                    onChange={(e) => setSelectedDestination(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">Select destination...</option>
                    {destinations.filter(d => d.enabled).map(destination => (
                      <option key={destination.id} value={destination.id}>
                        {getIcon(destination.type)} {destination.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Name (optional)</label>
                  <input
                    type="text"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="Connection name..."
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 mt-4">
                <button
                  onClick={() => setShowNewConnection(false)}
                  className="px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createTransformationMutation.mutate()}
                  disabled={!selectedSource || !selectedDestination}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Connection
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {transformations.length > 0 ? (
              transformations.map(transformation => (
                <ConnectionRow
                  key={transformation.id}
                  transformation={transformation}
                  onToggle={(id, enabled) => toggleTransformationMutation.mutate({ id, enabled })}
                  onDelete={(id) => deleteTransformationMutation.mutate(id)}
                />
              ))
            ) : (
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <ArrowRight className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-gray-400 mb-2">No Connections Yet</h3>
                <p className="text-gray-500 mb-4">Connect sources to destinations to start routing events</p>
                <button
                  onClick={() => setShowNewConnection(true)}
                  className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-600 hover:to-blue-700 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create First Connection</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
