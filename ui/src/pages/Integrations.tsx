import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle, XCircle, AlertCircle, Zap, Database, Send, Bell, Bug, Mail, Users, BarChart3 } from 'lucide-react';

interface Integration {
  name: string;
  configured: boolean;
  status: string;
  description: string;
  error?: string;
}

interface IntegrationsData {
  success: boolean;
  summary: {
    total: number;
    configured: number;
    active: number;
    healthPercentage: number;
  };
  integrations: Record<string, Integration>;
}

const getIntegrationIcon = (key: string) => {
  const icons: Record<string, any> = {
    mixpanel: BarChart3,
    lemlist: Mail,
    smartlead: Send,
    attio: Users,
    apollo: Database,
    hunter: Mail,
    slack: Bell,
    sentry: Bug,
  };
  return icons[key] || Zap;
};

const getIntegrationGradient = (key: string) => {
  const gradients: Record<string, string> = {
    mixpanel: 'from-purple-500 to-pink-500',
    lemlist: 'from-blue-500 to-cyan-500',
    smartlead: 'from-green-500 to-emerald-500',
    attio: 'from-orange-500 to-red-500',
    apollo: 'from-indigo-500 to-purple-500',
    hunter: 'from-yellow-500 to-orange-500',
    slack: 'from-pink-500 to-rose-500',
    sentry: 'from-red-500 to-pink-500',
  };
  return gradients[key] || 'from-gray-500 to-gray-600';
};

const StatusIndicator = ({ status }: { status: string }) => {
  if (status === 'active') {
    return (
      <div className="flex items-center text-emerald-400">
        <CheckCircle className="w-5 h-5 mr-2" />
        <span className="text-sm font-medium">Active</span>
      </div>
    );
  }
  
  if (status === 'not_configured') {
    return (
      <div className="flex items-center text-gray-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        <span className="text-sm font-medium">Not Configured</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center text-red-400">
      <XCircle className="w-5 h-5 mr-2" />
      <span className="text-sm font-medium">Error</span>
    </div>
  );
};

const IntegrationCard = ({ integrationKey, integration }: { integrationKey: string; integration: Integration }) => {
  const Icon = getIntegrationIcon(integrationKey);
  const gradient = getIntegrationGradient(integrationKey);
  const isActive = integration.status === 'active';
  const isConfigured = integration.configured;

  return (
    <div className={`group relative overflow-hidden rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
      isActive 
        ? 'bg-white/5 border-white/10 hover:bg-white/10' 
        : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
    }`}>
      {/* Animated gradient background on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
      
      {/* Status pulse indicator */}
      {isActive && (
        <div className="absolute top-4 right-4">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 bg-emerald-500`}></span>
          </span>
        </div>
      )}

      <div className="relative z-10 p-6">
        {/* Icon */}
        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} mb-4`}>
          <Icon className="w-6 h-6 text-white" />
        </div>

        {/* Name and description */}
        <h3 className="text-xl font-bold text-white mb-2">{integration.name}</h3>
        <p className="text-sm text-gray-400 mb-4">{integration.description}</p>

        {/* Status */}
        <StatusIndicator status={integration.status} />

        {/* Error message */}
        {integration.error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">{integration.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Integrations() {
  const { data, isLoading, error } = useQuery<IntegrationsData>({
    queryKey: ['system-integrations'],
    queryFn: async () => {
      const response = await axios.get('/api/system/integrations');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-white/5 rounded-lg w-64" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-64 bg-white/5 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-red-400 mb-2">Integration Status Unavailable</h2>
            <p className="text-gray-400">Unable to fetch integration status. Please check your connection.</p>
          </div>
        </div>
      </div>
    );
  }

  const healthPercentage = data.summary.healthPercentage;
  const getHealthColor = () => {
    if (healthPercentage >= 80) return 'text-emerald-400';
    if (healthPercentage >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Integrations
          </h1>
          <p className="text-gray-400">Monitor the health of all connected services</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-sm text-gray-400 mb-2">Total Integrations</p>
            <p className="text-3xl font-bold text-white">{data.summary.total}</p>
          </div>
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-sm text-gray-400 mb-2">Configured</p>
            <p className="text-3xl font-bold text-blue-400">{data.summary.configured}</p>
          </div>
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-sm text-gray-400 mb-2">Active</p>
            <p className="text-3xl font-bold text-emerald-400">{data.summary.active}</p>
          </div>
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-sm text-gray-400 mb-2">Health</p>
            <p className={`text-3xl font-bold ${getHealthColor()}`}>{healthPercentage}%</p>
          </div>
        </div>

        {/* Integration Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(data.integrations).map(([key, integration]) => (
            <IntegrationCard key={key} integrationKey={key} integration={integration} />
          ))}
        </div>

        {/* Integration Guide */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Configuration Guide</h2>
          <p className="text-gray-400 mb-6">
            To activate integrations, add the required environment variables to your deployment configuration.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">MIXPANEL_PROJECT_TOKEN</p>
              <p className="text-xs text-gray-500">Event tracking and analytics</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">LEMLIST_API_KEY</p>
              <p className="text-xs text-gray-500">Email outreach platform</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">SMARTLEAD_API_KEY</p>
              <p className="text-xs text-gray-500">Email automation</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">ATTIO_API_KEY</p>
              <p className="text-xs text-gray-500">CRM integration</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">APOLLO_API_KEY</p>
              <p className="text-xs text-gray-500">B2B data enrichment</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/5">
              <p className="text-sm font-mono text-cyan-400 mb-2">HUNTER_API_KEY</p>
              <p className="text-xs text-gray-500">Email verification</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
