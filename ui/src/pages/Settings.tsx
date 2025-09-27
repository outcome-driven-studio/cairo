import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Check, Key, Clock, Database, Bell, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface ConfigSection {
  title: string;
  icon: React.ReactNode;
  fields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  sensitive?: boolean;
}

const Settings: React.FC = () => {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const configSections: ConfigSection[] = [
    {
      title: 'API Keys',
      icon: <Key className="w-5 h-5" />,
      fields: [
        {
          key: 'LEMLIST_API_KEY',
          label: 'Lemlist API Key',
          type: 'password',
          placeholder: 'Enter your Lemlist API key',
          description: 'Required for syncing Lemlist campaigns and activities',
          sensitive: true
        },
        {
          key: 'SMARTLEAD_API_KEY',
          label: 'Smartlead API Key',
          type: 'password',
          placeholder: 'Enter your Smartlead API key',
          description: 'Required for syncing Smartlead campaigns and leads',
          sensitive: true
        },
        {
          key: 'ATTIO_API_KEY',
          label: 'Attio API Key',
          type: 'password',
          placeholder: 'Enter your Attio API key',
          description: 'Required for syncing data to Attio CRM',
          sensitive: true
        },
        {
          key: 'MIXPANEL_PROJECT_TOKEN',
          label: 'Mixpanel Project Token',
          type: 'password',
          placeholder: 'Enter your Mixpanel project token',
          description: 'Required for tracking events to Mixpanel',
          sensitive: true
        },
        {
          key: 'APOLLO_API_KEY',
          label: 'Apollo API Key',
          type: 'password',
          placeholder: 'Enter your Apollo API key',
          description: 'Used for lead enrichment and scoring',
          sensitive: true
        },
        {
          key: 'HUNTER_API_KEY',
          label: 'Hunter API Key',
          type: 'password',
          placeholder: 'Enter your Hunter.io API key',
          description: 'Alternative enrichment provider',
          sensitive: true
        },
        {
          key: 'OPENAI_API_KEY',
          label: 'OpenAI API Key',
          type: 'password',
          placeholder: 'Enter your OpenAI API key',
          description: 'Used for AI-powered enrichment',
          sensitive: true
        },
        {
          key: 'ANTHROPIC_API_KEY',
          label: 'Anthropic API Key',
          type: 'password',
          placeholder: 'Enter your Anthropic API key',
          description: 'Alternative AI provider for enrichment',
          sensitive: true
        }
      ]
    },
    {
      title: 'Sync Configuration',
      icon: <RefreshCw className="w-5 h-5" />,
      fields: [
        {
          key: 'USE_PERIODIC_SYNC',
          label: 'Enable Periodic Sync',
          type: 'boolean',
          description: 'Automatically sync data at regular intervals'
        },
        {
          key: 'SYNC_INTERVAL_HOURS',
          label: 'Sync Interval (hours)',
          type: 'number',
          placeholder: '4',
          description: 'How often to run automatic sync (in hours)'
        },
        {
          key: 'RUN_SYNC_ON_START',
          label: 'Run Sync on Startup',
          type: 'boolean',
          description: 'Perform initial sync when the server starts'
        },
        {
          key: 'SYNC_FROM_LEMLIST',
          label: 'Sync from Lemlist',
          type: 'boolean',
          description: 'Enable syncing data from Lemlist'
        },
        {
          key: 'SYNC_FROM_SMARTLEAD',
          label: 'Sync from Smartlead',
          type: 'boolean',
          description: 'Enable syncing data from Smartlead'
        },
        {
          key: 'SYNC_FROM_ATTIO',
          label: 'Import from Attio',
          type: 'boolean',
          description: 'Import new leads from Attio'
        },
        {
          key: 'CALCULATE_SCORES',
          label: 'Calculate Lead Scores',
          type: 'boolean',
          description: 'Enable automatic lead scoring'
        },
        {
          key: 'SYNC_SCORES_TO_ATTIO',
          label: 'Sync Scores to Attio',
          type: 'boolean',
          description: 'Push calculated scores back to Attio'
        }
      ]
    },
    {
      title: 'Database',
      icon: <Database className="w-5 h-5" />,
      fields: [
        {
          key: 'POSTGRES_URL',
          label: 'PostgreSQL Connection URL',
          type: 'password',
          placeholder: 'postgresql://user:pass@host/database',
          description: 'NeonDB or other PostgreSQL database connection string',
          sensitive: true
        }
      ]
    },
    {
      title: 'Monitoring',
      icon: <Bell className="w-5 h-5" />,
      fields: [
        {
          key: 'SENTRY_DSN',
          label: 'Sentry DSN',
          type: 'password',
          placeholder: 'https://...@sentry.io/...',
          description: 'Sentry error tracking DSN',
          sensitive: true
        },
        {
          key: 'SENTRY_LOG_WARNINGS',
          label: 'Log Warnings to Sentry',
          type: 'boolean',
          description: 'Send warning messages to Sentry'
        },
        {
          key: 'SENTRY_TRACK_SYNC',
          label: 'Track Sync Events',
          type: 'boolean',
          description: 'Send sync-related events to Sentry for monitoring'
        },
        {
          key: 'SLACK_WEBHOOK_URL',
          label: 'Slack Webhook URL',
          type: 'password',
          placeholder: 'https://hooks.slack.com/services/...',
          description: 'Slack webhook for notifications',
          sensitive: true
        }
      ]
    },
    {
      title: 'Environment',
      icon: <Globe className="w-5 h-5" />,
      fields: [
        {
          key: 'NODE_ENV',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'development', label: 'Development' },
            { value: 'production', label: 'Production' },
            { value: 'staging', label: 'Staging' }
          ],
          description: 'Application environment'
        },
        {
          key: 'LOG_LEVEL',
          label: 'Log Level',
          type: 'select',
          options: [
            { value: 'error', label: 'Error' },
            { value: 'warn', label: 'Warning' },
            { value: 'info', label: 'Info' },
            { value: 'debug', label: 'Debug' }
          ],
          description: 'Logging verbosity level'
        }
      ]
    }
  ];

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put('/api/config', config);
      toast.success('Configuration saved successfully! Restart may be required for some changes.');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const testConnection = async (service: string) => {
    try {
      const response = await axios.post('/api/config/test', { service });
      if (response.data.success) {
        toast.success(`${service} connection successful!`);
      } else {
        toast.error(`${service} connection failed: ${response.data.error}`);
      }
    } catch (error) {
      toast.error(`Failed to test ${service} connection`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="px-8 py-6 border-b border-border/50">
          <div className="animate-pulse">
            <div className="h-6 bg-muted rounded w-32 mb-2"></div>
            <div className="h-4 bg-muted rounded w-96"></div>
          </div>
        </div>
        <div className="px-8 py-6">
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border/50">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your Cairo CDP configuration. Changes will be applied after saving.
        </p>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        <div className="space-y-8">
          {configSections.map((section) => (
            <div key={section.title} className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="text-muted-foreground">{section.icon}</div>
                <h2 className="text-lg font-medium text-foreground">{section.title}</h2>
              </div>

              <div className="space-y-4 pl-8">
                {section.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {field.label}
                    </label>

                    {field.type === 'boolean' ? (
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={config[field.key] === 'true' || config[field.key] === true}
                          onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-border rounded"
                        />
                        <span className="text-sm text-muted-foreground">
                          {field.description}
                        </span>
                      </div>
                    ) : field.type === 'select' ? (
                      <div className="space-y-1">
                        <select
                          value={config[field.key] || ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                        >
                          <option value="">Select...</option>
                          {field.options?.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="relative">
                          <input
                            type={field.sensitive && !showPasswords[field.key] ? 'password' : field.type === 'password' ? 'text' : field.type}
                            value={config[field.key] || ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground placeholder:text-muted-foreground"
                          />
                          {field.sensitive && (
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(field.key)}
                              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showPasswords[field.key] ? '🙈' : '👁️'}
                            </button>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="border-t border-border/50 px-8 py-4 flex justify-between items-center">
          <button
            onClick={fetchConfig}
            className="px-4 py-2 border border-border rounded-lg hover:bg-muted/50 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center text-sm font-medium transition-all"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Configuration
          </button>
        </div>

        {/* Info Box */}
        <div className="mx-8 mb-6 p-4 bg-muted/30 border border-border/50 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Important Notes</h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Some configuration changes require a server restart to take effect</li>
                <li>• API keys and sensitive data are encrypted before storage</li>
                <li>• Database connection changes will restart all active syncs</li>
                <li>• Test connections before saving to avoid service disruptions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;