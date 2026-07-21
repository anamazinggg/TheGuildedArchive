import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface StorageLocation {
  id: string;
  code: string;
  name: string;
  room: string | null;
  cabinet: string | null;
  shelf: string | null;
  drawer: string | null;
  tray: string | null;
  box: string | null;
  slot: string | null;
  parentId: string | null;
  _count?: { items: number; children: number };
}

interface LocationItem {
  id: string;
  sku: string;
  title: string;
  status: string;
  askingPrice: number | null;
  category: string;
}

export default function StoragePage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code') || '';

  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [locationItems, setLocationItems] = useState<LocationItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '', name: '', room: '', cabinet: '', shelf: '',
    drawer: '', tray: '', box: '', slot: '', parentId: '',
  });
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const fetchLocations = async () => {
    try {
      const res = await api.get<{ locations: StorageLocation[] }>('/storage', token || undefined);
      setLocations(res.locations);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocationDetail = async (locationId: string) => {
    try {
      const [locRes, itemsRes] = await Promise.all([
        api.get<{ location: StorageLocation }>(`/storage/${locationId}`, token || undefined),
        api.get<{ items: LocationItem[]; count: number }>(`/storage/${locationId}/items`, token || undefined),
      ]);
      setSelectedLocation(locRes.location);
      setLocationItems(itemsRes.items);
      setViewMode('detail');
    } catch (err) {
      console.error('Failed to fetch location detail:', err);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [token]);

  useEffect(() => {
    if (id) {
      fetchLocationDetail(id);
    } else if (codeFromUrl) {
      const loc = locations.find((l) => l.code === codeFromUrl);
      if (loc) navigate(`/storage/${loc.id}`, { replace: true });
    } else {
      setViewMode('list');
    }
  }, [id, codeFromUrl, locations]);

  const resetForm = () => {
    setForm({ code: '', name: '', room: '', cabinet: '', shelf: '', drawer: '', tray: '', box: '', slot: '', parentId: '' });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleEdit = (loc: StorageLocation) => {
    setForm({
      code: loc.code, name: loc.name,
      room: loc.room || '', cabinet: loc.cabinet || '', shelf: loc.shelf || '',
      drawer: loc.drawer || '', tray: loc.tray || '', box: loc.box || '', slot: loc.slot || '',
      parentId: loc.parentId || '',
    });
    setEditingId(loc.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      parentId: form.parentId || undefined,
      room: form.room || undefined,
      cabinet: form.cabinet || undefined,
      shelf: form.shelf || undefined,
      drawer: form.drawer || undefined,
      tray: form.tray || undefined,
      box: form.box || undefined,
      slot: form.slot || undefined,
    };

    try {
      if (editingId) {
        await api.put(`/storage/${editingId}`, payload, token || undefined);
      } else {
        await api.post('/storage', payload, token || undefined);
      }
      resetForm();
      fetchLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save location');
    }
  };

  const handleDelete = async (locId: string) => {
    if (!confirm('Delete this storage location?')) return;
    try {
      await api.delete(`/storage/${locId}`, token || undefined);
      fetchLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location');
    }
  };

  const handleDownloadQR = (locId: string, code: string) => {
    window.open(`/api/storage/${locId}/qrcode`, '_blank');
  };

  // Detail view for a single location
  if (viewMode === 'detail' && selectedLocation) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => { setViewMode('list'); navigate('/storage'); }} className="text-sm text-primary-600 hover:text-primary-700 mb-1">
              ← Back to Locations
            </button>
            <h1 className="font-serif font-bold text-2xl text-gray-900">{selectedLocation.name}</h1>
            <p className="text-gray-500 mt-1 font-mono">{selectedLocation.code}</p>
          </div>
          <button
            onClick={() => handleDownloadQR(selectedLocation.id, selectedLocation.code)}
            className="btn-primary"
          >
            Download QR Code
          </button>
        </div>

        {/* QR Code Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card flex flex-col items-center">
            <h3 className="font-semibold text-gray-900 mb-3">Location QR Code</h3>
            <img
              src={`/api/storage/${selectedLocation.id}/qrcode`}
              alt={`QR code for ${selectedLocation.code}`}
              className="w-48 h-48 border border-gray-200 rounded-lg"
            />
            <p className="text-xs text-gray-400 mt-2">Scan to view this location</p>
          </div>
          <div className="card lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-3">Location Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selectedLocation.room && <div><span className="text-gray-500">Room:</span> <span className="font-medium">{selectedLocation.room}</span></div>}
              {selectedLocation.cabinet && <div><span className="text-gray-500">Cabinet:</span> <span className="font-medium">{selectedLocation.cabinet}</span></div>}
              {selectedLocation.shelf && <div><span className="text-gray-500">Shelf:</span> <span className="font-medium">{selectedLocation.shelf}</span></div>}
              {selectedLocation.drawer && <div><span className="text-gray-500">Drawer:</span> <span className="font-medium">{selectedLocation.drawer}</span></div>}
              {selectedLocation.tray && <div><span className="text-gray-500">Tray:</span> <span className="font-medium">{selectedLocation.tray}</span></div>}
              {selectedLocation.box && <div><span className="text-gray-500">Box:</span> <span className="font-medium">{selectedLocation.box}</span></div>}
              {selectedLocation.slot && <div><span className="text-gray-500">Slot:</span> <span className="font-medium">{selectedLocation.slot}</span></div>}
            </div>
          </div>
        </div>

        {/* Items at this location */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Items at this Location ({locationItems.length})</h2>
          {locationItems.length === 0 ? (
            <p className="text-sm text-gray-400">No items stored at this location.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">SKU</th>
                    <th className="table-header">Title</th>
                    <th className="table-header">Category</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {locationItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/inventory/${item.id}`)}
                    >
                      <td className="table-cell font-mono text-xs">{item.sku}</td>
                      <td className="table-cell font-medium">{item.title}</td>
                      <td className="table-cell">{item.category}</td>
                      <td className="table-cell">
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full font-medium bg-gray-100 text-gray-700">
                          {item.status}
                        </span>
                      </td>
                      <td className="table-cell">
                        {item.askingPrice ? `$${item.askingPrice.toFixed(2)}` : '-'}
                      </td>
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

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Storage Locations</h1>
          <p className="text-gray-500 mt-1">{locations.length} locations</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary">
          + Add Location
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {showForm && (
        <div className="card mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="font-semibold text-gray-900">{editingId ? 'Edit Location' : 'Add Location'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input name="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="input-field" placeholder="CAB-A1-T3" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field" placeholder="Main Cabinet, Top Shelf" required />
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Room</label><input name="room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Cabinet</label><input name="cabinet" value={form.cabinet} onChange={(e) => setForm({ ...form, cabinet: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Shelf</label><input name="shelf" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Drawer</label><input name="drawer" value={form.drawer} onChange={(e) => setForm({ ...form, drawer: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Tray</label><input name="tray" value={form.tray} onChange={(e) => setForm({ ...form, tray: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Box</label><input name="box" value={form.box} onChange={(e) => setForm({ ...form, box: e.target.value })} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Slot</label><input name="slot" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })} className="input-field" /></div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent</label>
                <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="input-field">
                  <option value="">None</option>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Create'}</button>
              <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : locations.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No storage locations yet. Add your first location to organize inventory.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Code</th>
                <th className="table-header">Name</th>
                <th className="table-header">Room</th>
                <th className="table-header">Cabinet</th>
                <th className="table-header">Shelf</th>
                <th className="table-header">Items</th>
                <th className="table-header">QR</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {locations.map((loc) => (
                <tr key={loc.id} className="hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs">
                    <button onClick={() => navigate(`/storage/${loc.id}`)} className="text-primary-600 hover:text-primary-700">
                      {loc.code}
                    </button>
                  </td>
                  <td className="table-cell font-medium">{loc.name}</td>
                  <td className="table-cell">{loc.room || '-'}</td>
                  <td className="table-cell">{loc.cabinet || '-'}</td>
                  <td className="table-cell">{loc.shelf || '-'}</td>
                  <td className="table-cell">{loc._count?.items || 0}</td>
                  <td className="table-cell">
                    <button
                      onClick={() => handleDownloadQR(loc.id, loc.code)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      QR ▼
                    </button>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(loc)} className="text-primary-600 hover:text-primary-700 text-xs font-medium">Edit</button>
                      <button onClick={() => handleDelete(loc.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
