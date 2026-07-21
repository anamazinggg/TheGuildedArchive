import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  type: string;
  estimatedEra: string | null;
  metalType: string | null;
  metalPurity: string | null;
  gemstoneType: string | null;
  gemstoneColor: string | null;
  condition: string;
  conditionNotes: string | null;
  dimensions: string | null;
  weight: string | null;
  brand: string | null;
  ringSize: string | null;
  askingPrice: number | null;
  minAcceptablePrice: number | null;
  status: string;
  photos: { id: string; filename: string; isPrimary: boolean; sortOrder: number }[];
}

const marketplaces = [
  { value: 'Etsy', label: 'Etsy' },
  { value: 'Ebay', label: 'eBay' },
  { value: 'Both', label: 'Both (Etsy + eBay)' },
];

export default function CreateListing() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedMarketplace, setSelectedMarketplace] = useState('Etsy');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await api.get<{ item: InventoryItem }>(`/inventory/${id}`, token || undefined);
        setItem(res.item);
      } catch (err) {
        setError('Failed to load inventory item');
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [id, token]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    setDuplicateError(null);

    const itemData = item!;
    const title = itemData.title;
    const price = itemData.askingPrice || 0;

    try {
      if (selectedMarketplace === 'Both') {
        // Create Etsy listing first
        const etsyRes = await api.post<{ listing: { id: string } }>('/listings', {
          inventoryItemId: itemData.id,
          marketplace: 'Etsy',
          title,
          price,
          description: itemData.description || '',
          quantity: 1,
        }, token || undefined);

        // Then duplicate to eBay
        await api.post(`/listings/${etsyRes.listing.id}/duplicate`, {}, token || undefined);

        navigate(`/listings/${etsyRes.listing.id}`);
      } else {
        const res = await api.post<{ listing: { id: string } }>('/listings', {
          inventoryItemId: itemData.id,
          marketplace: selectedMarketplace,
          title,
          price,
          description: itemData.description || '',
          quantity: 1,
        }, token || undefined);

        navigate(`/listings/${res.listing.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create listing';
      if (msg.includes('already has an active listing')) {
        setDuplicateError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!item) return <div className="text-center py-12 text-gray-400">Item not found</div>;

  const isBlocked = ['Sold', 'Shipped', 'Returned', 'Archived'].includes(item.status);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Create Listing</h1>
        <p className="text-gray-500 mt-1">
          for{' '}
          <Link to={`/inventory/${item.id}`} className="text-primary-600 hover:text-primary-700">
            {item.sku} — {item.title}
          </Link>
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {isBlocked ? (
        <div className="card">
          <div className="text-center py-8">
            <span className="text-4xl mb-3 block">🔒</span>
            <h2 className="font-semibold text-gray-900 mb-2">Cannot Create Listing</h2>
            <p className="text-gray-500">
              This item has status "<strong>{item.status}</strong>" and cannot be listed.
            </p>
            <Link to={`/inventory/${item.id}`} className="btn-secondary inline-block mt-4">
              Back to Item
            </Link>
          </div>
        </div>
      ) : (
        <div className="card max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Choose Marketplace</h2>

          {duplicateError && (
            <div className="bg-yellow-50 text-yellow-700 px-4 py-3 rounded-lg text-sm mb-4">
              {duplicateError}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {marketplaces.map((mp) => (
              <label
                key={mp.value}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedMarketplace === mp.value
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="marketplace"
                  value={mp.value}
                  checked={selectedMarketplace === mp.value}
                  onChange={(e) => setSelectedMarketplace(e.target.value)}
                  className="text-primary-600"
                />
                <div>
                  <p className="font-medium text-gray-900">{mp.label}</p>
                  {mp.value === 'Both' && (
                    <p className="text-xs text-gray-500">Create listings on both Etsy and eBay simultaneously</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Listing Preview</h3>
            <div className="text-sm space-y-1">
              <p><span className="text-gray-500">Title:</span> {item.title}</p>
              <p><span className="text-gray-500">Price:</span> ${(item.askingPrice || 0).toFixed(2)}</p>
              <p><span className="text-gray-500">Category:</span> {item.category}</p>
              <p><span className="text-gray-500">Photos:</span> {item.photos.length} available</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create Listing'}
            </button>
            <button onClick={() => navigate(`/inventory/${item.id}`)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
