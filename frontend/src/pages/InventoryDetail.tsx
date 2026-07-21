import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface InventoryTag {
  tag: Tag;
}

interface InventoryPhoto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  isPrimary: boolean;
  sortOrder: number;
}

interface InventoryDocument {
  id: string;
  filename: string;
  originalName: string;
  documentType: string | null;
}

interface StorageLocation {
  id: string;
  code: string;
  name: string;
}

interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  type: string;
  estimatedEra: string | null;
  brand: string | null;
  metalType: string | null;
  metalPurity: string | null;
  gemstoneType: string | null;
  gemstoneColor: string | null;
  ringSize: string | null;
  dimensions: string | null;
  weight: string | null;
  condition: string;
  conditionNotes: string | null;
  restorationHistory: string | null;
  authenticityNotes: string | null;
  purchaseSource: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  restorationCost: number | null;
  cleaningCost: number | null;
  appraisalCost: number | null;
  packagingCost: number | null;
  shippingCost: number | null;
  totalCostBasis: number | null;
  askingPrice: number | null;
  minAcceptablePrice: number | null;
  currentMarketplacePrice: number | null;
  storageLocationId: string | null;
  status: string;
  dateListed: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  photos: InventoryPhoto[];
  documents: InventoryDocument[];
  tags: InventoryTag[];
  storageLocation: StorageLocation | null;
}

const categories = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Brooch', 'Watch', 'Other'];
const types = ['Antique', 'Vintage', 'Estate', 'Reproduction', 'Unknown'];
const conditions = ['Mint', 'Excellent', 'VeryGood', 'Good', 'Fair', 'Poor', 'AsIs'];
const statuses = ['Draft', 'NeedsPhotos', 'NeedsResearch', 'ReadyToList', 'ListedOnEtsy', 'ListedOnEbay', 'ListedOnBoth', 'Reserved', 'Sold', 'Shipped', 'Returned', 'Delisted', 'Archived'];

const formatCond = (c: string) => c.replace(/([A-Z])/g, ' $1').trim();

export default function InventoryDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const [form, setForm] = useState({
    sku: '', title: '', description: '', category: 'Other', type: 'Unknown',
    estimatedEra: '', brand: '', metalType: '', metalPurity: '', gemstoneType: '',
    gemstoneColor: '', ringSize: '', dimensions: '', weight: '',
    condition: 'Good', conditionNotes: '', restorationHistory: '', authenticityNotes: '',
    purchaseSource: '', purchaseDate: '', purchaseCost: '',
    restorationCost: '0', cleaningCost: '0', appraisalCost: '0', packagingCost: '0', shippingCost: '0',
    askingPrice: '', minAcceptablePrice: '', currentMarketplacePrice: '',
    storageLocationId: '', status: 'Draft',
  });

  const isNew = id === 'new';

  const fetchItem = async () => {
    if (id && id !== 'new') {
      const res = await api.get<{ item: InventoryItem }>(`/inventory/${id}`, token || undefined);
      setItem(res.item);
      const i = res.item;
      setForm({
        sku: i.sku, title: i.title, description: i.description,
        category: i.category, type: i.type, estimatedEra: i.estimatedEra || '',
        brand: i.brand || '', metalType: i.metalType || '', metalPurity: i.metalPurity || '',
        gemstoneType: i.gemstoneType || '', gemstoneColor: i.gemstoneColor || '',
        ringSize: i.ringSize || '', dimensions: i.dimensions || '', weight: i.weight || '',
        condition: i.condition, conditionNotes: i.conditionNotes || '',
        restorationHistory: i.restorationHistory || '', authenticityNotes: i.authenticityNotes || '',
        purchaseSource: i.purchaseSource || '',
        purchaseDate: i.purchaseDate ? i.purchaseDate.split('T')[0] : '',
        purchaseCost: i.purchaseCost?.toString() || '',
        restorationCost: i.restorationCost?.toString() || '0',
        cleaningCost: i.cleaningCost?.toString() || '0',
        appraisalCost: i.appraisalCost?.toString() || '0',
        packagingCost: i.packagingCost?.toString() || '0',
        shippingCost: i.shippingCost?.toString() || '0',
        askingPrice: i.askingPrice?.toString() || '',
        minAcceptablePrice: i.minAcceptablePrice?.toString() || '',
        currentMarketplacePrice: i.currentMarketplacePrice?.toString() || '',
        storageLocationId: i.storageLocationId || '', status: i.status,
      });
      setSelectedTagIds(i.tags.map((t) => t.tag.id));
    }
  };

  useEffect(() => {
    async function init() {
      try {
        if (token) {
          const [tagsRes, storageRes] = await Promise.all([
            api.get<{ tags: Tag[] }>('/tags', token),
            api.get<{ locations: StorageLocation[] }>('/storage', token),
          ]);
          setAllTags(tagsRes.tags);
          setStorageLocations(storageRes.locations);
        }
        await fetchItem();
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : undefined,
      restorationCost: parseFloat(form.restorationCost) || 0,
      cleaningCost: parseFloat(form.cleaningCost) || 0,
      appraisalCost: parseFloat(form.appraisalCost) || 0,
      packagingCost: parseFloat(form.packagingCost) || 0,
      shippingCost: parseFloat(form.shippingCost) || 0,
      askingPrice: form.askingPrice ? parseFloat(form.askingPrice) : undefined,
      minAcceptablePrice: form.minAcceptablePrice ? parseFloat(form.minAcceptablePrice) : undefined,
      currentMarketplacePrice: form.currentMarketplacePrice ? parseFloat(form.currentMarketplacePrice) : undefined,
      purchaseDate: form.purchaseDate || undefined,
      storageLocationId: form.storageLocationId || undefined,
      tagIds: selectedTagIds,
    };

    try {
      if (isNew) {
        await api.post('/inventory', payload, token || undefined);
      } else {
        await api.put(`/inventory/${id}`, payload, token || undefined);
      }
      navigate('/inventory');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Photo handlers
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id || id === 'new') return;
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i]);
      }
      await api.upload(`/inventory/${id}/photos`, formData, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photos');
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!id || id === 'new') return;
    try {
      await api.delete(`/inventory/${id}/photos/${photoId}`, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete photo');
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    if (!id || id === 'new') return;
    try {
      await api.put(`/inventory/${id}/photos/${photoId}/primary`, {}, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary photo');
    }
  };

  const handleMovePhoto = async (photoId: string, direction: 'up' | 'down') => {
    if (!id || id === 'new' || !item) return;
    const photos = [...item.photos].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === photos.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [photos[idx], photos[swapIdx]] = [photos[swapIdx], photos[idx]];
    const photoIds = photos.map((p) => p.id);

    try {
      await api.put(`/inventory/${id}/photos/reorder`, { photoIds }, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder photos');
    }
  };

  // Document handlers
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id || id === 'new') return;
    setUploadingDocs(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('documents', files[i]);
      }
      await api.upload(`/inventory/${id}/documents`, formData, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload documents');
    } finally {
      setUploadingDocs(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!id || id === 'new') return;
    try {
      await api.delete(`/inventory/${id}/documents/${docId}`, token || undefined);
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!isNew && !item) return <div className="text-center py-12 text-gray-400">Item not found</div>;

  const inputClass = "input-field";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">
            {isNew ? 'New Inventory Item' : `Edit: ${item?.title}`}
          </h1>
        </div>
        <button onClick={() => navigate('/inventory')} className="btn-secondary">Back to Inventory</button>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Photo Gallery (existing items only) */}
      {!isNew && item && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Photos ({item.photos.length})</h2>
            <div className="flex gap-2">
              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
                id="photo-upload"
              />
              <label htmlFor="photo-upload" className="btn-primary text-sm cursor-pointer">
                {uploadingPhotos ? 'Uploading...' : '+ Upload Photos'}
              </label>
              {item.id && (
                <a
                  href={`/api/inventory/${item.id}/qrcode`}
                  className="btn-secondary text-sm"
                  download
                >
                  QR Code
                </a>
              )}
            </div>
          </div>
          {item.photos.length === 0 ? (
            <p className="text-sm text-gray-400">No photos yet. Upload some to showcase this item.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...item.photos].sort((a, b) => a.sortOrder - b.sortOrder).map((photo) => (
                <div
                  key={photo.id}
                  className={`relative group rounded-lg overflow-hidden border-2 ${
                    photo.isPrimary ? 'border-primary-400' : 'border-gray-200'
                  }`}
                >
                  <img
                    src={`/uploads/${photo.filename}`}
                    alt={photo.originalName}
                    className="w-full h-32 object-cover cursor-pointer"
                    onClick={() => setLightboxPhoto(`/uploads/${photo.filename}`)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => handleMovePhoto(photo.id, 'up')}
                      className="bg-white/90 p-1 rounded text-xs hover:bg-white"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMovePhoto(photo.id, 'down')}
                      className="bg-white/90 p-1 rounded text-xs hover:bg-white"
                      title="Move down"
                    >
                      ↓
                    </button>
                    {!photo.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(photo.id)}
                        className="bg-white/90 p-1 rounded text-xs hover:bg-white text-yellow-600"
                        title="Set as primary"
                      >
                        ★
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="bg-red-500/90 p-1 rounded text-xs hover:bg-red-600 text-white"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  {photo.isPrimary && (
                    <div className="absolute top-1 left-1 bg-primary-500 text-white text-xs px-1.5 py-0.5 rounded">
                      Primary
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents (existing items only) */}
      {!isNew && item && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Documents ({item.documents.length})</h2>
            <div>
              <input
                ref={docInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={handleDocUpload}
                className="hidden"
                id="doc-upload"
              />
              <label htmlFor="doc-upload" className="btn-primary text-sm cursor-pointer">
                {uploadingDocs ? 'Uploading...' : '+ Upload Documents'}
              </label>
            </div>
          </div>
          {item.documents.length === 0 ? (
            <p className="text-sm text-gray-400">No documents yet. Upload certificates, appraisals, or receipts.</p>
          ) : (
            <div className="space-y-2">
              {item.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{doc.filename.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{doc.originalName}</p>
                      <p className="text-xs text-gray-400">{doc.documentType || 'document'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/uploads/${doc.filename}`}
                      className="text-sm text-primary-600 hover:text-primary-700"
                      download
                    >
                      Download
                    </a>
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Form */}
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>SKU *</label>
                <input name="sku" value={form.sku} onChange={handleChange} className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>Title *</label>
                <input name="title" value={form.title} onChange={handleChange} className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select name="type" value={form.type} onChange={handleChange} className={inputClass}>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select name="status" value={form.status} onChange={handleChange} className={inputClass}>
                  {statuses.map((s) => <option key={s} value={s}>{formatCond(s)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Estimated Era</label>
                <input name="estimatedEra" value={form.estimatedEra} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Brand</label>
                <input name="brand" value={form.brand} onChange={handleChange} className={inputClass} />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelClass}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} className={inputClass} rows={3} />
            </div>
          </div>

          {/* Materials & Measurements */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Materials & Measurements</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className={labelClass}>Metal Type</label><input name="metalType" value={form.metalType} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Metal Purity</label><input name="metalPurity" value={form.metalPurity} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Gemstone Type</label><input name="gemstoneType" value={form.gemstoneType} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Gemstone Color</label><input name="gemstoneColor" value={form.gemstoneColor} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Ring Size</label><input name="ringSize" value={form.ringSize} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Dimensions</label><input name="dimensions" value={form.dimensions} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Weight</label><input name="weight" value={form.weight} onChange={handleChange} className={inputClass} /></div>
              <div>
                <label className={labelClass}>Condition</label>
                <select name="condition" value={form.condition} onChange={handleChange} className={inputClass}>
                  {conditions.map((c) => <option key={c} value={c}>{formatCond(c)}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelClass}>Condition Notes</label><textarea name="conditionNotes" value={form.conditionNotes} onChange={handleChange} className={inputClass} rows={2} /></div>
              <div><label className={labelClass}>Restoration History</label><textarea name="restorationHistory" value={form.restorationHistory} onChange={handleChange} className={inputClass} rows={2} /></div>
            </div>
          </div>

          {/* Pricing & Costs */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Pricing & Costs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className={labelClass}>Purchase Cost</label><input name="purchaseCost" type="number" step="0.01" value={form.purchaseCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Restoration Cost</label><input name="restorationCost" type="number" step="0.01" value={form.restorationCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Cleaning Cost</label><input name="cleaningCost" type="number" step="0.01" value={form.cleaningCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Appraisal Cost</label><input name="appraisalCost" type="number" step="0.01" value={form.appraisalCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Packaging Cost</label><input name="packagingCost" type="number" step="0.01" value={form.packagingCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Shipping Cost</label><input name="shippingCost" type="number" step="0.01" value={form.shippingCost} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Asking Price</label><input name="askingPrice" type="number" step="0.01" value={form.askingPrice} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Min Acceptable Price</label><input name="minAcceptablePrice" type="number" step="0.01" value={form.minAcceptablePrice} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Marketplace Price</label><input name="currentMarketplacePrice" type="number" step="0.01" value={form.currentMarketplacePrice} onChange={handleChange} className={inputClass} /></div>
            </div>
          </div>

          {/* Purchase Info */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Purchase & Provenance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelClass}>Purchase Source</label><input name="purchaseSource" value={form.purchaseSource} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Purchase Date</label><input name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleChange} className={inputClass} /></div>
              <div className="md:col-span-2"><label className={labelClass}>Authenticity Notes</label><textarea name="authenticityNotes" value={form.authenticityNotes} onChange={handleChange} className={inputClass} rows={2} /></div>
            </div>
          </div>

          {/* Storage Location */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Storage</h2>
            <div>
              <label className={labelClass}>Storage Location</label>
              <select name="storageLocationId" value={form.storageLocationId} onChange={handleChange} className={inputClass}>
                <option value="">No location</option>
                {storageLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? 'bg-primary-100 text-primary-800 ring-1 ring-primary-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
              {allTags.length === 0 && <p className="text-sm text-gray-400">No tags yet.</p>}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : isNew ? 'Create Item' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate('/inventory')} className="btn-secondary">Cancel</button>
        </div>
      </form>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxPhoto(null)}
        >
          <img
            src={lightboxPhoto}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
            onClick={() => setLightboxPhoto(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
