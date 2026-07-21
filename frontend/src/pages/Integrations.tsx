import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface MarketplaceAccount {
  id: string;
  marketplace: string;
  accountName: string;
  isConnected: boolean;
  storeName: string | null;
  storeId: string | null;
  lastSyncAt: string | null;
  syncStatus: string;
  syncErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncEvent {
  id: string;
  marketplace: string;
  eventType: string;
  status: string;
  message: string | null;
  createdDate: string;
}

interface MarketplaceStatus {
  connected: boolean;
  syncStatus: string | null;
  syncErrorMessage: string | null;
  lastSyncAt: string | null;
  storeName: string | null;
  storeId: string | null;
  syncEvents: SyncEvent[];
  activeListings: number;
}

function formatDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString();
}

function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString();
}

export default function Integrations() {
  const { token } = useAuth();

  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [etsyStatus, setEtsyStatus] = useState<MarketplaceStatus | null>(null);
  const [ebayStatus, setEbayStatus] = useState<MarketplaceStatus | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showDisconnect, setShowDisconnect] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [accRes, etsyRes, ebayRes] = await Promise.all([
        api.get<{ accounts: MarketplaceAccount[] }>('/integrations', token || undefined),
        api.get<MarketplaceStatus>('/integrations/etsy/status', token || undefined),
        api.get<MarketplaceStatus>('/integrations/ebay/status', token || undefined),
      ]);
      setAccounts(accRes.accounts);
      setEtsyStatus(etsyRes);
      setEbayStatus(ebayRes);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [token]);

  const handleMockConnect = async (marketplace: string) => {
    setConnecting(marketplace);
    try {
      const key = marketplace.toLowerCase();
      await api.get(`/integrations/${key}/mock-callback`, token || undefined);
      await fetchAll();
    } catch (err) {
      console.error(`Mock connect ${marketplace} failed:`, err);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (marketplace: string) => {
    try {
      const key = marketplace.toLowerCase();
      await api.post(`/integrations/${key}/disconnect`, {}, token || undefined);
      setShowDisconnect(null);
      await fetchAll();
    } catch (err) {
      console.error(`Disconnect ${marketplace} failed:`, err);
    }
  };

  const handleSync = async (marketplace: string) => {
    setSyncing(marketplace);
    try {
      const key = marketplace.toLowerCase();
      await api.post(`/integrations/${key}/sync`, {}, token || undefined);
      await fetchAll();
    } catch (err) {
      console.error(`Sync ${marketplace} failed:`, err);
    } finally {
      setSyncing(null);
    }
  };

  const isMockMode = true;

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif font-bold text-2xl text-gray-900">Integrations</h1>
          <p className="text-gray-500 mt-1">Marketplace connections & sync status</p>
        </div>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const renderMarketplaceSection = (
    marketplace: 'Etsy' | 'Ebay',
    status: MarketplaceStatus | null
  ) => {
    const isConnected = status?.connected || false;
    const syncStatus = status?.syncStatus || 'Idle';
    const key = marketplace.toLowerCase();
    const isConnecting = connecting === marketplace;
    const isSyncing = syncing === marketplace;

    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {marketplace === 'Etsy' ? '🧡' : '🔵'}
            </span>
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">{marketplace}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                ></span>
                <span className="text-sm text-gray-500">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
                {isConnected && status?.storeName && (
                  <span className="text-sm text-gray-400">· {status.storeName}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <button
                  onClick={() => handleSync(marketplace)}
                  disabled={isSyncing || syncStatus === 'Syncing'}
                  className="btn-secondary text-sm"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  onClick={() => setShowDisconnect(marketplace)}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => handleMockConnect(marketplace)}
                disabled={isConnecting}
                className="btn-primary text-sm"
              >
                {isConnecting ? 'Connecting...' : `Connect ${marketplace}`}
              </button>
            )}
          </div>
        </div>

        {isConnected && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500 uppercase">Store ID</p>
              <p className="text-sm font-medium font-mono">{status?.storeId || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Last Sync</p>
              <p className="text-sm font-medium">{formatDate(status?.lastSyncAt || null)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Sync Status</p>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    syncStatus === 'Idle'
                      ? 'bg-green-500'
                      : syncStatus === 'Syncing'
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-red-500'
                  }`}
                ></span>
                <span className="text-sm font-medium">{syncStatus}</span>
              </div>
              {syncStatus === 'Error' && status?.syncErrorMessage && (
                <p className="text-xs text-red-600 mt-1">{status.syncErrorMessage}</p>
              )}
            </div>
          </div>
        )}

        {isConnected && status?.syncEvents && status.syncEvents.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Sync Events</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {status.syncEvents.slice(0, 5).map((ev) => (
                    <tr key={ev.id}>
                      <td className="px-3 py-2 text-gray-500">{formatDateShort((ev as any).createdAt || '')}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                          {ev.eventType}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                            ev.status === 'Success'
                              ? 'bg-green-100 text-green-700'
                              : ev.status === 'Failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{ev.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disconnect confirmation */}
        {showDisconnect === marketplace && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 mb-3">
              Are you sure you want to disconnect {marketplace}? All active listings will be ended locally.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDisconnect(marketplace)}
                className="btn-danger text-sm"
              >
                Yes, Disconnect
              </button>
              <button
                onClick={() => setShowDisconnect(null)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Collect all sync events for the history table
  const allEvents: (SyncEvent & { marketplace: string })[] = [];
  if (etsyStatus?.syncEvents) {
    allEvents.push(...etsyStatus.syncEvents.map(e => ({ ...e, marketplace: 'Etsy' })));
  }
  if (ebayStatus?.syncEvents) {
    allEvents.push(...ebayStatus.syncEvents.map(e => ({ ...e, marketplace: 'Ebay' })));
  }
  allEvents.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Integrations</h1>
        <p className="text-gray-500 mt-1">Marketplace connections & sync status</p>
      </div>

      {isMockMode && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <span className="text-xl">🔧</span>
          <div>
            <p className="font-medium text-blue-800 text-sm">Using mock marketplace mode</p>
            <p className="text-xs text-blue-600">Connect real API credentials in Settings to go live</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {renderMarketplaceSection('Etsy', etsyStatus)}
        {renderMarketplaceSection('Ebay', ebayStatus)}
      </div>

      {/* Sync History Table */}
      <div className="card mt-6">
        <h2 className="font-semibold text-gray-900 mb-4">Sync History</h2>
        {allEvents.length === 0 ? (
          <p className="text-gray-400 text-sm">No sync events yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Date/Time</th>
                  <th className="table-header">Marketplace</th>
                  <th className="table-header">Event Type</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allEvents.slice(0, 20).map((ev) => (
                  <tr key={ev.id}>
                    <td className="table-cell text-xs">
                      {formatDate((ev as any).createdAt || '')}
                    </td>
                    <td className="table-cell">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          ev.marketplace === 'Etsy'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {ev.marketplace}
                      </span>
                    </td>
                    <td className="table-cell">{ev.eventType}</td>
                    <td className="table-cell">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          ev.status === 'Success'
                            ? 'bg-green-100 text-green-700'
                            : ev.status === 'Failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-gray-500">{ev.message || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
