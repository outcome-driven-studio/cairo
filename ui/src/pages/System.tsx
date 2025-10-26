import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Activity, Database, Server, Cpu, HardDrive, Clock, Zap } from 'lucide-react';

interface SystemStatus {
  success: boolean;
  status: string;
  timestamp: string;
  uptime: number;
  database: {
    status: string;
    responseTime: string;
    version: string;
    size: string;
    connections: number;
    tables: number;
  };
  server: {
    nodeVersion: string;
    platform: string;
    memory: {
      used: string;
      total: string;
    };
    environment: string;
  };
}

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    connected: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    unhealthy: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${colors[status as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
      <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
      {status}
    </span>
  );
};

const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  gradient = 'from-cyan-500 to-blue-500'
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: any;
  gradient?: string;
}) => (
  <div className="group relative overflow-hidden rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient} bg-opacity-10`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  </div>
);

export default function System() {
  const { data: status, isLoading, error } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: async () => {
      const response = await axios.get('/api/system/status');
      return response.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-white/5 rounded-lg w-64" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-white/5 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-red-400 mb-2">System Status Unavailable</h2>
            <p className="text-gray-400">Unable to fetch system status. Please check your connection.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
              System Status
            </h1>
            <p className="text-gray-400">Real-time monitoring of Cairo CDP infrastructure</p>
          </div>
          <StatusBadge status={status.status} />
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="System Uptime"
            value={formatUptime(status.uptime)}
            subtitle={`Since ${new Date(Date.now() - status.uptime * 1000).toLocaleString()}`}
            icon={Clock}
            gradient="from-emerald-500 to-teal-500"
          />
          <MetricCard
            title="Database Response"
            value={status.database.responseTime}
            subtitle={status.database.version}
            icon={Zap}
            gradient="from-cyan-500 to-blue-500"
          />
          <MetricCard
            title="Active Connections"
            value={status.database.connections}
            subtitle={`${status.database.tables} tables`}
            icon={Activity}
            gradient="from-purple-500 to-pink-500"
          />
          <MetricCard
            title="Memory Usage"
            value={status.server.memory.used}
            subtitle={`of ${status.server.memory.total}`}
            icon={Cpu}
            gradient="from-orange-500 to-red-500"
          />
        </div>

        {/* Detailed Info Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Database Info */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center mb-6">
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 mr-4">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Database</h2>
                <p className="text-sm text-gray-400">{status.database.status}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Version</span>
                <span className="text-white font-mono text-sm">{status.database.version}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Database Size</span>
                <span className="text-white font-mono text-sm">{status.database.size}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Tables</span>
                <span className="text-white font-mono text-sm">{status.database.tables}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-gray-400">Response Time</span>
                <span className="text-emerald-400 font-mono text-sm">{status.database.responseTime}</span>
              </div>
            </div>
          </div>

          {/* Server Info */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center mb-6">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 mr-4">
                <Server className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Server</h2>
                <p className="text-sm text-gray-400">{status.server.environment}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Node.js</span>
                <span className="text-white font-mono text-sm">{status.server.nodeVersion}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Platform</span>
                <span className="text-white font-mono text-sm">{status.server.platform}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400">Memory (Heap)</span>
                <span className="text-white font-mono text-sm">{status.server.memory.used} / {status.server.memory.total}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-gray-400">Uptime</span>
                <span className="text-emerald-400 font-mono text-sm">{formatUptime(status.uptime)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Info Footer */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <HardDrive className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-400">Last Updated</p>
                <p className="text-white font-mono text-sm">{new Date(status.timestamp).toLocaleString()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Database Size</p>
              <p className="text-white font-bold">{status.database.size}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
