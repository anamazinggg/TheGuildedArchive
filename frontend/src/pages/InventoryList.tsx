import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface InventoryPhoto {
  id: string;
  filename: string;
  isPrimary: boolean;
}

interface InventoryTag {
  tag: Tag;
}

interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  category: string;
  status: string;
  askingPrice: number | null;
  photos: InventoryPhoto[];
  tags: InventoryTag[];
  createdAt: string;
  deletedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function InventoryList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tagIdFromUrl = searchParams.get('tagId') || '';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (tagIdFromUrl) params.set('tagId', tagIdFromUrl);

      const res = await api.get<{ items: InventoryItem[]; pagination: Pagination }>(
        `/inventory?${params.toString()}`,
        token || undefined
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [page, statusFilter, categoryFilter, tagIdFromUrl]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await api.delete(`/inventory/${id}`, token || undefined);
      fetchItems();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleExport = (type: string) => {
    let url = '/api/inventory/export';
    if (type === 'sold') {
      url += '?sold=true';
    } else if (type === 'filtered') {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search) params.set('search', search);
      if (params.toString()) url += '?' + params.toString();
    }
    // Trigger download
    window.open(url, '_blank');
    setShowExportMenu(false);
  };

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    NeedsPhotos: 'bg-yellow-100 text-yellow-700',
    NeedsResearch: 'bg-orange-100 text-orange-700',
    ReadyToList: 'bg-blue-100 text-blue-700',
    ListedOnEtsy: 'bg-green-100 text-green-700',
    ListedOnEbay: 'bg-green-100 text-green-700',
    ListedOnBoth: 'bg-teal-100 text-teal-700',
    Reserved: 'bg-purple-100 text-purple-700',
    Sold: 'bg-emerald-100 text-emerald-700',
    Shipped: 'bg-indigo-100 text-indigo-700',
    Returned: 'bg-red-100 text-red-700',
    Delisted: 'bg-gray-100 text-gray-500',
    Archived: 'bg-gray-200 text-gray-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Inventory</h1>
          <p className="text-gray-500 mt-1">
            {pagination.total} items total
            {tagIdFromUrl && <span className="text-primary-600 ml-1">· filtered by tag</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn-secondary">
              Export ▾
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => handleExport('all')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export All Active
                </button>
                <button
                  onClick={() => handleExport('filtered')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export Filtered
                </button>
                <button
                  onClick={() => handleExport('sold')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export Sold Items
                </button>
              </div>
            )}
          </div>
          <Link to="/inventory/import" className="btn-secondary">
            Import CSV
          </Link>
          <Link to="/inventory/new" className="btn-primary">
            + Add Item
          </Link>
        </div>
      </div>

      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, SKU, or description..."
            className="input-field flex-1 min-w-[200px]"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field w-40"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="NeedsPhotos">Needs Photos</option>
            <option value="NeedsResearch">Needs Research</option>
            <option value="ReadyToList">Ready to List</option>
            <option value="ListedOnEtsy">Listed on Etsy</option>
            <option value="ListedOnEbay">Listed on eBay</option>
            <option value="ListedOnBoth">Listed on Both</option>
            <option value="Reserved">Reserved</option>
            <option value="Sold">Sold</option>
            <option value="Shipped">Shipped</option>
            <option value="Returned">Returned</option>
            <option value="Archived">Archived</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input-field w-40"
          >
            <option value="">All Categories</option>
            <option value="Ring">Ring</option>
            <option value="Necklace">Necklace</option>
            <option value="Bracelet">Bracelet</option>
            <option value="Earrings">Earrings</option>
            <option value="Brooch">Brooch</option>
            <option value="Watch">Watch</option>
            <option value="Other">Other</option>
          </select>
          <button type="submit" className="btn-primary">Search</button>
        </form>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No inventory items found.{' '}
            <Link to="/inventory/new" className="text-primary-600 hover:text-primary-700">Add your first item</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Photo</th>
                  <th className="table-header">SKU</th>
                  <th className="table-header">Title</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Price</th>
                  <th className="table-header">Tags</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => {
                  const primaryPhoto = item.photos.find((p) => p.isPrimary) || item.photos[0];
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/inventory/${item.id}`)}>
                      <td className="table-cell">
                        {primaryPhoto ? (
                          <img
                            src={`/uploads/${primaryPhoto.filename}`}
                            alt={item.title}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                            N/A
                          </div>
                        )}
                      </td>
                      <td className="table-cell font-mono text-xs">{item.sku}</td>
                      <td className="table-cell font-medium">{item.title}</td>
                      <td className="table-cell">{item.category}</td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-700'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="table-cell">
                        {item.askingPrice ? `$${item.askingPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {item.tags.map((t) => (
                            <span
                              key={t.tag.id}
                              className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"
                            >
                              {t.tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
