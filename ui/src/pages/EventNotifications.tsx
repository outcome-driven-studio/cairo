import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Bell,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Settings,
  Send,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

interface DestinationSettings {
  webhookUrl?: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
  avatarUrl?: string;
  alertEvents?: string[];
  paymentThreshold?: number;
  eventOverrides?: Record<string, { title?: string; color?: string; description?: string }>;
}

interface Destination {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  settings: DestinationSettings;
  created_at?: string;
  updated_at?: string;
}

const NOTIFIER_TYPES = ['slack', 'discord'];
const DEFAULT_EVENT_NAMES = [
  'identify', 'page', 'group', 'Sign Up', 'Signup', 'Login', 'Purchase',
  'Payment Completed', 'Subscription Created', 'Subscription Cancelled',
  'Trial Started', 'Lead Created', 'Email Opened', 'Email Clicked',
  'Sync Completed', 'Error Occurred', 'User Action', 'Page Viewed',
];

function getTypeMeta(type: string) {
  const meta: Record<string, { icon: string; label: string; gradient: string }> = {
    slack: { icon: '💬', label: 'Slack', gradient: 'from-purple-500 to-pink-500' },
    discord: { icon: '🎮', label: 'Discord', gradient: 'from-indigo-500 to-violet-600' },
  };
  return meta[type?.toLowerCase()] || { icon: '📢', label: type, gradient: 'from-slate-500 to-slate-600' };
}

function EventChip({
  event,
  onRemove,
  canRemove,
}: {
  event: string;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-sm text-gray-200">
      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
      {event}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 p-0.5 rounded hover:bg-red-500/30 text-gray-400 hover:text-red-400 transition-colors"
          aria-label={`Remove ${event}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

function NotifierCard({
  destination,
  suggestedEvents,
  onUpdate,
  onTest,
  isUpdating,
  isTesting,
}: {
  destination: Destination;
  suggestedEvents: string[];
  onUpdate: (id: number, settings: DestinationSettings) => void;
  onTest: (id: number) => void;
  isUpdating: boolean;
  isTesting: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showEventsPicker, setShowEventsPicker] = useState(false);
  const [draft, setDraft] = useState<DestinationSettings>(() => ({
    ...destination.settings,
    alertEvents: Array.isArray(destination.settings?.alertEvents)
      ? [...destination.settings.alertEvents]
      : [],
  }));

  const meta = getTypeMeta(destination.type);
  const addedEvents = draft.alertEvents || [];
  const canAddEvents = suggestedEvents.filter((e) => !addedEvents.includes(e));

  const handleAddEvent = (event: string) => {
    setDraft((prev) => ({
      ...prev,
      alertEvents: [...(prev.alertEvents || []), event],
    }));
    setShowEventsPicker(false);
  };

  const handleRemoveEvent = (event: string) => {
    setDraft((prev) => ({
      ...prev,
      alertEvents: (prev.alertEvents || []).filter((e) => e !== event),
    }));
  };

  const handleSave = () => {
    onUpdate(destination.id, draft);
  };

  const hasChanges = useMemo(() => {
    const cur = destination.settings || {};
    const curEvents = (cur.alertEvents || []).slice().sort().join(',');
    const newEvents = (draft.alertEvents || []).slice().sort().join(',');
    return (
      curEvents !== newEvents ||
      cur.username !== draft.username ||
      cur.channel !== draft.channel ||
      cur.iconEmoji !== draft.iconEmoji ||
      cur.avatarUrl !== draft.avatarUrl ||
      (cur.paymentThreshold ?? 100) !== (draft.paymentThreshold ?? 100)
    );
  }, [destination.settings, draft]);

  const isSlack = destination.type?.toLowerCase() === 'slack';
  const isDiscord = destination.type?.toLowerCase() === 'discord';

  return (
    <div className="rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-2xl shadow-lg`}
          >
            {meta.icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{destination.name}</h2>
            <p className="text-sm text-gray-400 flex items-center gap-2">
              {meta.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  destination.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {destination.enabled ? 'Active' : 'Paused'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTest(destination.id);
            }}
            disabled={isTesting}
            className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
            title="Send test notification"
          >
            <Send className="w-5 h-5" />
          </button>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-white/10 pt-5">
          {/* Events to notify */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                Events to notify
              </h3>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEventsPicker(!showEventsPicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-gray-300 border border-white/10"
                >
                  <Plus className="w-4 h-4" />
                  Add event
                </button>
                {showEventsPicker && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowEventsPicker(false)}
                      aria-hidden
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 w-64 max-h-60 overflow-y-auto rounded-xl bg-slate-800 border border-white/10 shadow-xl py-1 scrollbar-thin">
                      {canAddEvents.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-gray-500">All suggested events added</p>
                      ) : (
                        canAddEvents.map((event) => (
                          <button
                            key={event}
                            type="button"
                            onClick={() => handleAddEvent(event)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                          >
                            {event}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {addedEvents.length === 0 ? (
                <p className="text-sm text-gray-500">No events selected — add events above or leave empty to allow all.</p>
              ) : (
                addedEvents.map((event) => (
                  <EventChip
                    key={event}
                    event={event}
                    onRemove={() => handleRemoveEvent(event)}
                    canRemove
                  />
                ))
              )}
            </div>
          </div>

          {/* Notifier settings */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-cyan-400" />
              Notifier options
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bot / username</label>
                <input
                  type="text"
                  value={draft.username ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, username: e.target.value }))}
                  placeholder={isSlack ? 'Cairo CDP' : 'Cairo CDP'}
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none text-sm"
                />
              </div>
              {isSlack && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Default channel</label>
                  <input
                    type="text"
                    value={draft.channel ?? ''}
                    onChange={(e) => setDraft((p) => ({ ...p, channel: e.target.value }))}
                    placeholder="#events"
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
              )}
              {isSlack && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Icon emoji</label>
                  <input
                    type="text"
                    value={draft.iconEmoji ?? ''}
                    onChange={(e) => setDraft((p) => ({ ...p, iconEmoji: e.target.value }))}
                    placeholder=":rocket:"
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
              )}
              {isDiscord && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Avatar URL</label>
                  <input
                    type="url"
                    value={draft.avatarUrl ?? ''}
                    onChange={(e) => setDraft((p) => ({ ...p, avatarUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment threshold (min amount to alert)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.paymentThreshold ?? 100}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      paymentThreshold: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none text-sm"
                />
              </div>
            </div>
          </div>

          {/* Per-event message overrides (optional) */}
          {addedEvents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-violet-400" />
                Message overrides (optional)
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                Customize title or color per event. Leave blank to use defaults.
              </p>
              <div className="space-y-3">
                {addedEvents.slice(0, 5).map((event) => {
                  const overrides = draft.eventOverrides?.[event] || {};
                  return (
                    <div
                      key={event}
                      className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-black/20 border border-white/5"
                    >
                      <span className="text-sm font-medium text-gray-300 w-32 truncate">{event}</span>
                      <input
                        type="text"
                        value={overrides.title ?? ''}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            eventOverrides: {
                              ...p.eventOverrides,
                              [event]: { ...(p.eventOverrides?.[event] || {}), title: e.target.value || undefined },
                            },
                          }))
                        }
                        placeholder="Custom title"
                        className="flex-1 min-w-[120px] px-2 py-1.5 rounded bg-black/30 border border-white/10 text-white text-sm placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={overrides.color ?? ''}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            eventOverrides: {
                              ...p.eventOverrides,
                              [event]: { ...(p.eventOverrides?.[event] || {}), color: e.target.value || undefined },
                            },
                          }))
                        }
                        placeholder="Color (e.g. #3498db)"
                        className="w-28 px-2 py-1.5 rounded bg-black/30 border border-white/10 text-white text-sm placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  );
                })}
                {addedEvents.length > 5 && (
                  <p className="text-xs text-gray-500">+ {addedEvents.length - 5} more events (override in JSON if needed)</p>
                )}
              </div>
            </div>
          )}

          {hasChanges && (
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDraft({ ...destination.settings, alertEvents: [...(destination.settings?.alertEvents || [])] })}
                className="px-4 py-2 rounded-lg bg-white/10 text-gray-300 hover:bg-white/15 transition-colors text-sm font-medium"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 text-sm"
              >
                {isUpdating ? (
                  <>Saving…</>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EventNotifications() {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message?: string } | null>(null);

  const { data: destinationsData } = useQuery<{ success: boolean; destinations: Destination[] }>({
    queryKey: ['destinations'],
    queryFn: async () => {
      const res = await axios.get('/api/config/destinations');
      return res.data;
    },
  });

  const { data: eventNamesData } = useQuery<{ success: boolean; eventNames: string[] }>({
    queryKey: ['event-names'],
    queryFn: async () => {
      const res = await axios.get('/api/config/event-names');
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, settings }: { id: number; settings: DestinationSettings }) => {
      await axios.put(`/api/config/destinations/${id}`, { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await axios.post(`/api/config/destinations/${id}/test`);
      return res.data as { success: boolean; test?: { success?: boolean; message?: string; error?: string } };
    },
    onSuccess: (data, id) => {
      const success = data?.test?.success ?? data?.success ?? false;
      const message = data?.test?.message ?? data?.test?.error ?? (success ? 'Sent' : 'Failed');
      setTestResult({ id, success, message });
      setTimeout(() => setTestResult(null), 4000);
    },
    onError: (_, id) => {
      setTestResult({ id, success: false, message: 'Request failed' });
      setTimeout(() => setTestResult(null), 4000);
    },
  });

  const destinations = destinationsData?.destinations ?? [];
  const notifiers = useMemo(
    () => destinations.filter((d) => NOTIFIER_TYPES.includes(d.type?.toLowerCase())),
    [destinations]
  );
  const suggestedEvents = eventNamesData?.eventNames ?? DEFAULT_EVENT_NAMES;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 bg-clip-text text-transparent mb-2">
            Event notifications
          </h1>
          <p className="text-gray-400">
            Choose which events to push to each connection and customize the notifier and message.
          </p>
        </div>

        {notifiers.length === 0 ? (
          <div className="rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 p-12 text-center">
            <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-bold text-gray-300 mb-2">No notifier connections</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Add a Slack or Discord destination in Connections first. Then you can configure which events to send and how they look here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {testResult && (
              <div
                className={`rounded-xl px-4 py-3 flex items-center gap-3 ${
                  testResult.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {testResult.success ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                <span>{testResult.message}</span>
              </div>
            )}
            {notifiers.map((dest) => (
              <NotifierCard
                key={dest.id}
                destination={dest}
                suggestedEvents={suggestedEvents}
                onUpdate={(id, settings) => updateMutation.mutate({ id, settings })}
                onTest={(id) => testMutation.mutate(id)}
                isUpdating={updateMutation.isPending}
                isTesting={testMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
