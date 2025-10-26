import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Database, Table, HardDrive, FileText } from 'lucide-react';

interface TableInfo {
  schema: string;
  name: string;
  size: string;
  rows: number;
  error?: string;
}

interface DatabaseData {
  success: boolean;
  summary: {
    totalTables: number;
    totalRows: number;
    totalSize: string;
  };
  tables: TableInfo[];
}

const TableCard = ({ table }: { table: TableInfo }) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="group relative overflow-hidden rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
              <Table className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-mono">{table.name}</h3>
              <p className="text-xs text-gray-500">{table.schema}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Rows</p>
            <p className="text-2xl font-bold text-white">{formatNumber(table.rows)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Size</p>
            <p className="text-2xl font-bold text-cyan-400">{table.size}</p>
          </div>
        </div>

        {table.error && (
          <div className="mt-4 p-2 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">{table.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function DatabaseTables() {
  const { data, isLoading, error } = useQuery<DatabaseData>({
    queryKey: ['system-tables'],
    queryFn: async () => {
      const response = await axios.get('/api/system/tables');
      return response.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-white/5 rounded-lg w-64" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-white/5 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-48 bg-white/5 rounded-xl" />
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
            <h2 className="text-2xl font-bold text-red-400 mb-2">Database Information Unavailable</h2>
            <p className="text-gray-400">Unable to fetch database table information.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Database Tables
          </h1>
          <p className="text-gray-400">Explore database schema and table statistics</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 mr-4">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Tables</p>
                <p className="text-3xl font-bold text-white">{data.summary.totalTables}</p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 mr-4">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Rows</p>
                <p className="text-3xl font-bold text-white">{data.summary.totalRows.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 mr-4">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Database Size</p>
                <p className="text-3xl font-bold text-white">{data.summary.totalSize}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tables Grid */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Tables</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.tables.map((table) => (
              <TableCard key={`${table.schema}.${table.name}`} table={table} />
            ))}
          </div>
        </div>

        {/* Info Footer */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Database Schema</h3>
              <p className="text-sm text-gray-400">
                Showing all tables in the <span className="font-mono text-cyan-400">public</span> schema
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Last Updated</p>
              <p className="text-white font-mono text-sm">{new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
