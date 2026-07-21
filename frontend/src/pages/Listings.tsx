import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface InventoryItemRef {
  id: string;
  sku: string;
  title: string;
  status: string;
  photos: { filename: string }[];
}

interface MarketplaceListing {
  id: string;
  inventoryItemId: string;
  marketplace: string;
  marketplaceListingId: string;
  marketplaceListingUrl: string | null;
  title: string;
  description: string | null;
  price: number;
  quantity: number;
  status: string;
  marketplaceCategory: string | null;
  shippingProfile: string | null;
  returnPolicy: string | null;
  tags: string | null;
  photoOrder: string | null;
  lastSyncAt: string | null;
  syncStatus: string;
  syncMessage: string | null;
  createdAt: string;
  inventoryItem: InventoryItemRef;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CompletenessResult {
  id: string;
  listingId: string;
  completeness: {
    score: number;
    warnings: string[];
  };
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-700',
  Ended: 'bg-gray-100 text-gray-500',
  Sold: 'bg-emerald-100 text-emerald-700',
  Error: 'bg-red-100 text-red-700',
  Inactive: 'bg-yellow-100 text-yellow-700',
};

function getCompletenessColor(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function Listings() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [completenessMap, setCompletenessMap] = useState<Record<string, number>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (marketplaceFilter) params.set('marketplace', marketplaceFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await api.get<{ listings: MarketplaceListing[]; pagination: Pagination }>(
        `/listings?${params.toString()}`,
        token || undefined
      );
      setListings(res.listings);
      setPagination(res.pagination);

      // Fetch completeness scores for each listing
      if (res.listings.length > 0) {
        const scores: Record<string, number> = {};
        await Promise.all(
          res.listings.map(async (l) => {
            try {
              const compRes = await api.get<CompletenessResult>(
                `/listings/completeness/${l.id}`,
                token || undefined
              );
              scores[l.id] = compRes.completeness.score;
            } catch {
              scores[l.id] = 0;
            }
          })
        );
        setCompletenessMap((prev) => ({ ...prev, ...scores }));
      }
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [page, marketplaceFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchListings();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === listings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(listings.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const listingIds = Array.from(selectedIds);
      if (bulkAction === 'publish') {
        await api.post('/listings/bulk-publish', { listingIds }, token || undefined);
      } else if (bulkAction === 'end') {
        await api.post('/listings/bulk-end', { listingIds }, token || undefined);
      } else if (bulkAction === 'delete') {
        // Delete one by one
        await Promise.all(
          listingIds.map((id) =>
            api.delete(`/listings/${id}`, token || undefined).catch(() => {})
          )
        );
      }
      setSelectedIds(new Set());
      setBulkAction(null);
      await fetchListings();
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Listings</h1>
          <p className="text-gray-500 mt-1">{pagination.total} listings total</p>
        </div>
        <Link to="/listings/templates" className="btn-secondary text-sm">
          Templates
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or listing ID..."
            className="input-field flex-1 min-w-[200px]"
          />
          <select
            value={marketplaceFilter}
            onChange={(e) => { setMarketplaceFilter(e.target.value); setPage(1); }}
            className="input-field w-36"
          >
            <option value="">All Marketplaces</option>
            <option value="Etsy">Etsy</option>
            <option value="Ebay">eBay</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field w-36"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Active">Active</option>
            <option value="Ended">Ended</option>
            <option value="Sold">Sold</option>
            <option value="Error">Error</option>
          </select>
          <button type="submit" className="btn-primary">Search</button>
        </form>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-primary-800">
            {selectedIds.size} listing{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setBulkAction('publish')}
              className="btn-primary text-xs"
            >
              Bulk Publish
            </button>
            <button
              onClick={() => setBulkAction('end')}
              className="btn-secondary text-xs"
            >
              Bulk End
            </button>
            <button
              onClick={() => setBulkAction('delete')}
              className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg bg-red-50"
            >
              Bulk Delete
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkAction(null); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk Confirmation */}
      {bulkAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="font-semibold text-gray-900 mb-2">Confirm Bulk {bulkAction === 'publish' ? 'Publish' : bulkAction === 'end' ? 'End' : 'Delete'}</h2>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to {bulkAction} {selectedIds.size} listing{selectedIds.size > 1 ? 's' : ''}?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBulkAction(null)} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={handleBulkAction}
                disabled={bulkLoading}
                className={bulkAction === 'delete' ? 'btn-danger text-sm' : 'btn-primary text-sm'}
              >
                {bulkLoading ? 'Processing...' : `Yes, ${bulkAction}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : listings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No listings found.{' '}
            <Link to="/inventory" className="text-primary-600 hover:text-primary-700">
              Browse inventory to create listings
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === listings.length && listings.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="table-header">Title</th>
                  <th className="table-header">Marketplace</th>
                  <th className="table-header">Inventory Item</th>
                  <th className="table-header">Price</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Completeness</th>
                  <th className="table-header">Last Synced</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {listings.map((listing) => {
                  const score = completenessMap[listing.id] ?? 0;
                  const photo = listing.inventoryItem?.photos?.[0];
                  return (
                    <tr
                      key={listing.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/listings/${listing.id}`)}
                    >
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(listing.id)}
                          onChange={() => toggleSelect(listing.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          {photo && (
                            <img
                              src={`/uploads/${photo.filename}`}
                              alt=""
                              className="w-8 h-8 object-cover rounded"
                            />
                          )}
                          <span className="font-medium text-gray-900">{listing.title}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                            listing.marketplace === 'Etsy'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {listing.marketplace}
                        </span>
                      </td>
                      <td className="table-cell">
                        {listing.inventoryItem ? (
                          <Link
                            to={`/inventory/${listing.inventoryItemId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary-600 hover:text-primary-700 text-sm"
                          >
                            {listing.inventoryItem.sku}
                          </Link>
                        ) : '-'}
                      </td>
                      <td className="table-cell font-medium">
                        {formatCurrency(listing.price)}
                      </td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${statusColors[listing.status] || 'bg-gray-100 text-gray-700'}`}>
                          {listing.status}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full max-w-[80px]">
                            <div
                              className={`h-2 rounded-full transition-all ${getCompletenessColor(score)}`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{score}%</span>
                        </div>
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {listing.lastSyncAt ? new Date(listing.lastSyncAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <Link
                            to={`/listings/${listing.id}`}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => {
                              setSelectedIds(new Set([listing.id]));
                              setBulkAction('delete');
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} items)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-secondary text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page === pagination.totalPages}
              className="btn-secondary text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
