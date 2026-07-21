import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Alert {
  id: string;
  category: string;
  title: string;
  itemId: string;
  description: string;
  action: string;
  actionLink: string;
}

interface AlertGroup {
  category: string;
  label: string;
  icon: string;
  alerts: Alert[];
}

export default function ActionCenter() {
  const { token } = useAuth();
  const [groups, setGroups] = useState<AlertGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{ total: number; groups: AlertGroup[] }>('/actions', token);
      setGroups(data.groups);
      setTotal(data.total);
    } catch (err) {
      console.error('Action center fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await api.put(`/actions/${alertId}/dismiss`, {}, token || undefined);
      setGroups(prev =>
        prev.map(g => ({ ...g, alerts: g.alerts.filter(a => a.id !== alertId) }))
        .filter(g => g.alerts.length > 0)
      );
      setTotal(prev => prev - 1);
      setActionFeedback(prev => ({ ...prev, [alertId]: 'Dismissed' }));
    } catch (err) {
      console.error('Dismiss error:', err);
    }
  };

  const snoozeAlert = async (alertId: string) => {
    try {
      await api.put(`/actions/${alertId}/snooze`, {}, token || undefined);
      setGroups(prev =>
        prev.map(g => ({ ...g, alerts: g.alerts.filter(a => a.id !== alertId) }))
        .filter(g => g.alerts.length > 0)
      );
      setTotal(prev => prev - 1);
      setActionFeedback(prev => ({ ...prev, [alertId]: 'Snoozed for 24h' }));
    } catch (err) {
      console.error('Snooze error:', err);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif font-bold text-2xl text-gray-900">Action Center</h1>
          <p className="text-gray-500 mt-1">Items requiring attention</p>
        </div>
        <div className="text-center py-12 text-gray-400">Loading alerts...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Action Center</h1>
        <p className="text-gray-500 mt-1">
          {total === 0
            ? 'All caught up! No items need attention.'
            : `${total} item${total !== 1 ? 's' : ''} requiring attention`}
        </p>
      </div>

      {groups.length === 0 && total === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl">🎉</span>
          <p className="text-gray-600 mt-3 text-lg font-medium">Everything looks great!</p>
          <p className="text-gray-400 text-sm mt-1">No alerts to show. Keep your listings fresh and photos updated.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.category} className="card">
              <button
                onClick={() => toggleCollapse(group.category)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{group.icon}</span>
                  <h2 className="font-semibold text-gray-900">{group.label}</h2>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                    {group.alerts.length}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">{collapsed[group.category] ? '▶' : '▼'}</span>
              </button>

              {!collapsed[group.category] && (
                <div className="mt-4 space-y-3">
                  {group.alerts.map(alert => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{alert.description}</p>
                        {actionFeedback[alert.id] && (
                          <p className="text-xs text-green-600 mt-1">{actionFeedback[alert.id]}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={alert.actionLink}
                          className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap"
                        >
                          {alert.action}
                        </a>
                        <button
                          onClick={() => snoozeAlert(alert.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                          title="Snooze for 24 hours"
                        >
                          Snooze
                        </button>
                        <button
                          onClick={() => dismissAlert(alert.id)}
                          className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
