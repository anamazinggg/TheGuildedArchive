import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { productConfig } from '../config/product';

interface ActivityLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SettingsActivity() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    document.title = `Activity Log — ${productConfig.productName}`;
  }, []);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      params.set('sort', sortOrder);
      if (filterAction) params.set('action', filterAction);
      if (filterEntityType) params.set('entityType', filterEntityType);

      const res = await api.get<{ logs: ActivityLogEntry[]; pagination: Pagination }>(
        `/activity?${params.toString()}`,
        token || undefined
      );
      setLogs(res.logs);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchLogs();
  }, [token, sortOrder]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const actionColor = (action: string) => {
    if (action.includes('create') || action.includes('publish') || action.includes('record'))
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (action.includes('update') || action.includes('edit'))
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (action.includes('delete') || action.includes('remove') || action.includes('end'))
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white">Activity Log</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Track all actions performed in the system</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
            <input
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="input-field"
              placeholder="e.g. inventory.create"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entity Type</label>
            <select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)} className="input-field">
              <option value="">All</option>
              <option value="InventoryItem">Inventory Item</option>
              <option value="MarketplaceListing">Listing</option>
              <option value="Order">Order</option>
              <option value="StorageLocation">Storage</option>
              <option value="User">User</option>
              <option value="Expense">Expense</option>
              <option value="Transaction">Transaction</option>
              <option value="Tag">Tag</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sort</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="input-field">
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">Filter</button>
          <button type="button" onClick={() => { setFilterAction(''); setFilterEntityType(''); }} className="btn-secondary">
            Clear
          </button>
        </form>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 dark:text-gray-500">
          No activity log entries found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="table-header">Timestamp</th>
                  <th className="table-header">User</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Entity Type</th>
                  <th className="table-header">Entity ID</th>
                  <th className="table-header">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="table-cell text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="table-cell">
                      {log.user ? (
                        <span className="text-sm">{log.user.name}</span>
                      ) : (
                        <span className="text-xs text-gray-400">System</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="table-cell text-sm">{log.entityType}</td>
                    <td className="table-cell text-xs font-mono">
                      {log.entityId.substring(0, 12)}...
                    </td>
                    <td className="table-cell text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {log.details ? (() => {
                        try {
                          const d = JSON.parse(log.details);
                          if (typeof d === 'object' && d !== null) {
                            return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ');
                          }
                          return log.details;
                        } catch {
                          return log.details;
                        }
                      })() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="btn-secondary text-sm"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn-secondary text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
