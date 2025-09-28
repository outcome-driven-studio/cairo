import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Database,
  Send,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Award,
  Target,
  Zap,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import axios from 'axios';

interface DashboardData {
  totalUsers: number;
  namespace: string;
  tableName: string;
  enrichmentRate: number;
  scoringRate: number;
  avgLeadScore: number;
  highQualityLeads: number;
  leadGradeDistribution: Array<{ name: string; value: number; color: string }>;
  userTrend: Array<{ date: string; users: number }>;
  leadScoreDistribution: Array<{ range: string; count: number; avgScore: number }>;
  enrichmentSources: Array<{ platform: string; count: number; color: string }>;
  recentActivity: Array<{
    id: string;
    email: string;
    name: string;
    platform: string;
    leadScore: number;
    leadGrade: string;
    activityType: string;
    timestamp: string;
    message: string;
  }>;
  syncStats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSync: string | null;
    successRate: number;
  };
}

const StatCard = ({ title, value, change, icon: Icon, trend = 'up' }: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  trend?: 'up' | 'down';
}) => (
  <div className="border border-border/50 rounded-lg p-6 hover:bg-muted/30 transition-colors">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold mt-2 text-foreground">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {change && (
          <p className={`text-sm mt-2 flex items-center ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${trend === 'down' ? 'rotate-180' : ''}`} />
            {change}
          </p>
        )}
      </div>
      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  </div>
);

const ActivityItem = ({ activity }: { activity: DashboardData['recentActivity'][0] }) => {
  const getIcon = () => {
    switch (activity.activityType) {
      case 'new_user':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'updated':
        return <Activity className="h-5 w-5 text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    if (activity.leadScore >= 80) return 'text-green-600';
    if (activity.leadScore >= 60) return 'text-blue-600';
    if (activity.leadScore >= 40) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="flex items-center space-x-3 p-3 hover:bg-muted rounded-lg transition-colors">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {activity.message}
        </p>
        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
          <span>{format(new Date(activity.timestamp), 'MMM d, HH:mm')}</span>
          {activity.leadScore && (
            <>
              <span>•</span>
              <span className={getStatusColor()}>
                Score: {activity.leadScore} ({activity.leadGrade})
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Overview() {
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const response = await axios.get('/api/dashboard/overview');
      return response.data as DashboardData;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-8">
        <div>
          <div className="h-8 bg-muted rounded w-64 mb-2"></div>
          <div className="h-4 bg-muted rounded w-96"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border border-border/50 rounded-lg p-6">
              <div className="h-4 bg-muted rounded w-24 mb-4"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="border border-border/50 rounded-lg p-6">
              <div className="h-6 bg-muted rounded w-32 mb-4"></div>
              <div className="h-64 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold cairo-gradient-text">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-2">Monitor your customer data platform performance</p>
        </div>
        <div className="border border-red-200 rounded-lg p-6 bg-red-50">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800">Unable to load dashboard data</h3>
              <p className="text-red-600 mt-1">
                {error instanceof Error ? error.message : 'Failed to fetch dashboard statistics'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold cairo-gradient-text">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-2">
          Monitoring {dashboardData.totalUsers.toLocaleString()} users in namespace <span className="font-mono text-blue-600">{dashboardData.namespace}</span>
        </p>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={dashboardData.totalUsers}
          change={`${dashboardData.scoringRate}% scored`}
          icon={Users}
        />
        <StatCard
          title="Enrichment Rate"
          value={`${dashboardData.enrichmentRate}%`}
          change={`${dashboardData.highQualityLeads} high-quality leads`}
          icon={Database}
        />
        <StatCard
          title="Avg Lead Score"
          value={dashboardData.avgLeadScore}
          change={`${dashboardData.syncStats.successRate}% sync success`}
          icon={Award}
        />
        <StatCard
          title="Total Syncs"
          value={dashboardData.syncStats.totalSyncs}
          change={dashboardData.syncStats.lastSync ? `Last: ${format(new Date(dashboardData.syncStats.lastSync), 'MMM d')}` : 'Never synced'}
          icon={Send}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Grade Distribution */}
        <div className="border border-border/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Lead Grade Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dashboardData.leadGradeDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
              >
                {dashboardData.leadGradeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Users']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {dashboardData.leadGradeDistribution.map((grade, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: grade.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {grade.name}: {grade.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Enrichment Sources */}
        <div className="border border-border/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Data Sources
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.enrichmentSources}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="platform" />
              <YAxis />
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Users']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {dashboardData.enrichmentSources.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* User Trend and Lead Score Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Trend */}
        {dashboardData.userTrend.length > 0 && (
          <div className="border border-border/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">User Growth (30 days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dashboardData.userTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                  formatter={(value) => [value.toLocaleString(), 'New Users']}
                />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Lead Score Distribution */}
        <div className="border border-border/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Lead Score Ranges</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dashboardData.leadScoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [
                  value.toLocaleString(),
                  name === 'count' ? 'Users' : 'Avg Score'
                ]}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border border-border/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          Recent Activity
        </h3>
        <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin">
          {dashboardData.recentActivity.length > 0 ? (
            dashboardData.recentActivity.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity found</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border border-border/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = '/destinations'}
            className="btn-primary flex items-center justify-center"
          >
            <Send className="w-4 h-4 mr-2" />
            Sync to Destinations
          </button>
          <button
            onClick={() => window.location.href = '/sources'}
            className="btn-secondary flex items-center justify-center"
          >
            <Database className="w-4 h-4 mr-2" />
            Manage Sources
          </button>
          <button
            onClick={() => window.location.href = '/events'}
            className="btn-outline flex items-center justify-center"
          >
            <Activity className="w-4 h-4 mr-2" />
            View Live Events
          </button>
        </div>
      </div>
    </div>
  );
}