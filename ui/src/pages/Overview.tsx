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
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';

// Mock data - replace with real API calls
const mockStats = {
  totalEvents: 15420,
  totalSources: 3,
  totalDestinations: 4,
  totalUsers: 1250,
  eventsTrend: [
    { date: '2024-01-01', events: 850 },
    { date: '2024-01-02', events: 920 },
    { date: '2024-01-03', events: 1100 },
    { date: '2024-01-04', events: 980 },
    { date: '2024-01-05', events: 1250 },
    { date: '2024-01-06', events: 1420 },
    { date: '2024-01-07', events: 1350 },
  ],
  topEvents: [
    { name: 'Page Viewed', value: 5420, color: '#3b82f6' },
    { name: 'Button Clicked', value: 3210, color: '#10b981' },
    { name: 'Form Submitted', value: 1890, color: '#f59e0b' },
    { name: 'Purchase Completed', value: 920, color: '#ef4444' },
    { name: 'User Signed Up', value: 680, color: '#8b5cf6' },
  ],
  recentActivity: [
    { id: 1, type: 'event', message: 'New user signed up', timestamp: new Date(), status: 'success' },
    { id: 2, type: 'destination', message: 'Slack destination offline', timestamp: new Date(Date.now() - 300000), status: 'error' },
    { id: 3, type: 'source', message: 'React SDK connected', timestamp: new Date(Date.now() - 600000), status: 'success' },
    { id: 4, type: 'event', message: 'High volume detected', timestamp: new Date(Date.now() - 900000), status: 'warning' },
  ],
};

const StatCard = ({ title, value, change, icon: Icon, trend = 'up' }: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  trend?: 'up' | 'down';
}) => (
  <div className="card p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold mt-2">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {change && (
          <p className={`text-sm mt-2 flex items-center ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${trend === 'down' ? 'rotate-180' : ''}`} />
            {change}
          </p>
        )}
      </div>
      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
    </div>
  </div>
);

const ActivityItem = ({ activity }: { activity: typeof mockStats.recentActivity[0] }) => {
  const getIcon = () => {
    switch (activity.status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="flex items-center space-x-3 p-3 hover:bg-muted rounded-lg transition-colors">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {activity.message}
        </p>
        <p className="text-sm text-muted-foreground">
          {format(activity.timestamp, 'MMM d, HH:mm')}
        </p>
      </div>
    </div>
  );
};

export default function Overview() {
  // In a real app, these would be actual API calls
  const { data: stats, isLoading } = useQuery({
    queryKey: ['overview-stats'],
    queryFn: () => Promise.resolve(mockStats),
  });

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-6">
              <div className="h-4 bg-muted rounded w-24 mb-4"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold cairo-gradient-text">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-2">
          Monitor your customer data platform performance and activity
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Events"
          value={stats?.totalEvents || 0}
          change="+12.5% from last week"
          icon={Activity}
        />
        <StatCard
          title="Active Sources"
          value={stats?.totalSources || 0}
          change="+1 new this week"
          icon={Database}
        />
        <StatCard
          title="Destinations"
          value={stats?.totalDestinations || 0}
          change="All healthy"
          icon={Send}
        />
        <StatCard
          title="Tracked Users"
          value={stats?.totalUsers || 0}
          change="+8.2% from last week"
          icon={Users}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events Trend */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Events Trend (7 days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats?.eventsTrend || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => format(new Date(value), 'MMM dd')}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                formatter={(value) => [value.toLocaleString(), 'Events']}
              />
              <Line
                type="monotone"
                dataKey="events"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Events */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Top Events</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats?.topEvents || []}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
              >
                {(stats?.topEvents || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Events']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(stats?.topEvents || []).map((event, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: event.color }}
                />
                <span className="text-sm text-muted-foreground truncate">
                  {event.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Event Volume by Hour</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { hour: '00', events: 120 },
                { hour: '04', events: 80 },
                { hour: '08', events: 350 },
                { hour: '12', events: 420 },
                { hour: '16', events: 380 },
                { hour: '20', events: 280 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="events" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin">
            {(stats?.recentActivity || []).map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary">
            <Database className="w-4 h-4 mr-2" />
            Add New Source
          </button>
          <button className="btn-secondary">
            <Send className="w-4 h-4 mr-2" />
            Configure Destination
          </button>
          <button className="btn-outline">
            <Activity className="w-4 h-4 mr-2" />
            View Live Events
          </button>
        </div>
      </div>
    </div>
  );
}