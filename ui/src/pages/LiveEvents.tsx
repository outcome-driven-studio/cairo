import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Activity, Mail, Users, Clock, Database } from 'lucide-react';

interface Event {
  id: string;
  event_type: string;
  platform: string;
  user_id?: string;
  email?: string;
  created_at: string;
  meta?: any;
}

interface EventsData {
  success: boolean;
  count: number;
  events: Event[];
}

const EventCard = ({ event }: { event: Event }) => {
  const getEventIcon = (type: string) => {
    if (type.includes('email')) return Mail;
    if (type.includes('user')) return Users;
    if (type.includes('data')) return Database;
    return Activity;
  };

  const Icon = getEventIcon(event.event_type);

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      mixpanel: 'from-purple-500 to-pink-500',
      lemlist: 'from-blue-500 to-cyan-500',
      smartlead: 'from-green-500 to-emerald-500',
      attio: 'from-orange-500 to-red-500',
    };
    return colors[platform?.toLowerCase()] || 'from-gray-500 to-gray-600';
  };

  return (
    <div className="group relative overflow-hidden rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-all duration-300">
      <div className={`absolute inset-0 bg-gradient-to-br ${getPlatformColor(event.platform)} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
      
      <div className="relative z-10 flex items-start space-x-4">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${getPlatformColor(event.platform)} flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white truncate">{event.event_type}</h3>
            <span className="text-xs text-gray-500 flex items-center ml-2">
              <Clock className="w-3 h-3 mr-1" />
              {new Date(event.created_at).toLocaleTimeString()}
            </span>
          </div>
          
          <div className="flex items-center space-x-3 text-xs">
            {event.platform && (
              <span className="px-2 py-1 rounded bg-white/10 text-gray-400 font-mono">
                {event.platform}
              </span>
            )}
            {event.email && (
              <span className="text-cyan-400 truncate">{event.email}</span>
            )}
          </div>

          {event.user_id && (
            <p className="text-xs text-gray-500 mt-2 font-mono truncate">
              ID: {event.user_id}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default function LiveEvents() {
  const { data, isLoading, error } = useQuery<EventsData>({
    queryKey: ['system-events'],
    queryFn: async () => {
      const response = await axios.get('/api/system/events/recent?limit=50');
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds for "live" feel
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-white/5 rounded-lg w-64" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-24 bg-white/5 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state on error instead of error message
  const events = data?.events || [];
  const count = data?.count || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
              Live Events
            </h1>
            <p className="text-gray-400">Real-time event stream from all integrations</p>
          </div>
          <div className="flex items-center space-x-2 px-4 py-2 rounded-full backdrop-blur-xl bg-white/5 border border-white/10">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium text-emerald-400">Live</span>
          </div>
        </div>

        {/* Event Count */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Recent Events</p>
              <p className="text-3xl font-bold text-white mt-1">{count}</p>
              {data?.message && (
                <p className="text-xs text-yellow-400 mt-2">{data.message}</p>
              )}
            </div>
            <Activity className="w-12 h-12 text-cyan-400 opacity-50" />
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          {events.length > 0 ? (
            events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
              <Activity className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">No Events Yet</h3>
              <p className="text-gray-500">Waiting for events from integrations...</p>
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Event Stream</h3>
              <p className="text-sm text-gray-400">
                Showing the most recent 50 events • Updates every 5 seconds
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
