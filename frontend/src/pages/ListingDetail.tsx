import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { productConfig } from '../config/product';

interface InventoryPhoto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  isPrimary: boolean;
  sortOrder: number;
}

interface InventoryTag {
  tag: { id: string; name: string };
}

interface StorageLocation {
  id: string;
  code: string;
  name: string;
}

interface InventoryItemFull {
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
  photos: InventoryPhoto[];
  tags: InventoryTag[];
  storageLocation: StorageLocation | null;
}

interface MarketplaceListing {
  id: string;
  inventoryItemId: string;
  marketplace: string;
  marketplaceListingId: string | null;
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
  etsySpecificFields: string | null;
  ebaySpecificFields: string | null;
  lastSyncAt: string | null;
  syncStatus: string;
  syncMessage: string | null;
  createdAt: string;
  inventoryItem: InventoryItemFull;
  marketplaceAccount: {
    id: string;
    storeId: string | null;
    storeName: string | null;
    isConnected: boolean;
  } | null;
}

interface CompletenessData {
  score: number;
  warnings: string[];
}

interface ListingTemplate {
  id: string;
  name: string;
  category: string;
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  tagsTemplate: string | null;
  shippingProfile: string | null;
  returnPolicy: string | null;
}

const categories = [...productConfig.categories];
const ETSY_TITLE_MAX = 140;

function getCompletenessColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getCompletenessBg(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function ListingDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [completeness, setCompleteness] = useState<CompletenessData | null>(null);
  const [templates, setTemplates] = useState<ListingTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishTarget, setPublishTarget] = useState<'Etsy' | 'Ebay' | 'Both' | null>(null);
  const [activeTab, setActiveTab] = useState<'etsy' | 'ebay' | 'shared'>('shared');
  const [showEtsyFields, setShowEtsyFields] = useState(false);
  const [showEbayFields, setShowEbayFields] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '0',
    quantity: '1',
    marketplaceCategory: '',
    shippingProfile: '',
    returnPolicy: '',
    tags: '',
    photoOrder: [] as string[],
    etsyDescription: '',
    ebayDescription: '',
    etsyMaterials: '',
    etsyEra: '',
    etsyConditionExtra: '',
    ebayItemSpecifics: '',
    ebayConditionGrade: '',
    ebayShippingWeight: '',
  });

  const isNew = id === 'new';
  const itemId = listing?.inventoryItemId;
  const marketplace = listing?.marketplace || 'Etsy';

  const fetchListing = async () => {
    if (id && id !== 'new') {
      const res = await api.get<{ listing: MarketplaceListing }>(`/listings/${id}`, token || undefined);
      const l = res.listing;
      setListing(l);
      const etsyFields = l.etsySpecificFields ? safeJsonParse(l.etsySpecificFields) : {};
      const ebayFields = l.ebaySpecificFields ? safeJsonParse(l.ebaySpecificFields) : {};
      const photoOrderArr = l.photoOrder ? safeJsonParse(l.photoOrder) : [];
      setForm({
        title: l.title || '',
        description: l.description || '',
        price: l.price?.toString() || '0',
        quantity: l.quantity?.toString() || '1',
        marketplaceCategory: l.marketplaceCategory || '',
        shippingProfile: l.shippingProfile || '',
        returnPolicy: l.returnPolicy || '',
        tags: l.tags || '',
        photoOrder: Array.isArray(photoOrderArr) ? photoOrderArr : [],
        etsyDescription: etsyFields.description || '',
        ebayDescription: ebayFields.description || '',
        etsyMaterials: etsyFields.materials || '',
        etsyEra: etsyFields.era || '',
        etsyConditionExtra: etsyFields.condition || '',
        ebayItemSpecifics: ebayFields.itemSpecifics || '',
        ebayConditionGrade: ebayFields.conditionGrade || '',
        ebayShippingWeight: ebayFields.shippingWeight || '',
      });

      // Fetch completeness
      try {
        const compRes = await api.get<{
          id: string;
          listingId: string;
          completeness: CompletenessData;
        }>(`/listings/completeness/${id}`, token || undefined);
        setCompleteness(compRes.completeness);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    async function init() {
      try {
        await fetchListing();
        // Fetch templates
        const tplRes = await api.get<{ templates: ListingTemplate[] }>(
          '/listings/templates',
          token || undefined
        );
        setTemplates(tplRes.templates);
      } catch (err) {
        console.error('Failed to load listing:', err);
        setError('Failed to load listing');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, token]);

  const safeJsonParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const applyTemplate = (tpl: ListingTemplate) => {
    let title = form.title;
    let desc = form.description;
    let tags = form.tags;

    if (tpl.titleTemplate && listing?.inventoryItem) {
      const item = listing.inventoryItem;
      title = tpl.titleTemplate
        .replace('{{metal}}', item.metalType || '')
        .replace('{{type}}', item.type || '')
        .replace('{{era}}', item.estimatedEra || '')
        .replace('{{category}}', item.category || '')
        .replace('{{gemstone}}', item.gemstoneType || '')
        .replace('{{brand}}', item.brand || '')
        .trim();
    }
    if (tpl.descriptionTemplate) {
      desc = tpl.descriptionTemplate;
    }
    if (tpl.tagsTemplate) {
      tags = tpl.tagsTemplate;
    }

    setForm({
      ...form,
      title,
      description: desc,
      tags,
      shippingProfile: tpl.shippingProfile || form.shippingProfile,
      returnPolicy: tpl.returnPolicy || form.returnPolicy,
    });
    setShowTemplatePicker(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const etsySpecific = {
        description: form.etsyDescription,
        materials: form.etsyMaterials,
        era: form.etsyEra,
        condition: form.etsyConditionExtra,
      };
      const ebaySpecific = {
        description: form.ebayDescription,
        itemSpecifics: form.ebayItemSpecifics,
        conditionGrade: form.ebayConditionGrade,
        shippingWeight: form.ebayShippingWeight,
      };
      const payload = {
        title: form.title,
        description: form.description,
        price: parseFloat(form.price) || 0,
        quantity: parseInt(form.quantity) || 1,
        marketplaceCategory: form.marketplaceCategory || null,
        shippingProfile: form.shippingProfile || null,
        returnPolicy: form.returnPolicy || null,
        tags: form.tags || null,
        photoOrder: form.photoOrder.length > 0 ? form.photoOrder : null,
        etsySpecificFields: etsySpecific,
        ebaySpecificFields: ebaySpecific,
      };

      if (isNew) {
        // This case is handled by creating from inventory
        // We'd need inventoryItemId - this page should only be used after creation
        // Redirect to create flow
        return;
      } else {
        await api.put(`/listings/${id}`, payload, token || undefined);
      }
      setSuccessMsg('Listing saved successfully');
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!publishTarget || !id) return;
    setSaving(true);
    setError('');
    try {
      if (publishTarget === 'Both') {
        // Publish the current listing and then publish its linked counterpart.
        if (listing?.status !== 'Active') {
          await api.post(`/listings/${id}/publish`, {}, token || undefined);
        }
        const otherMarketplace = listing?.marketplace === 'Etsy' ? 'Ebay' : 'Etsy';
        let counterpartId: string | null = null;

        try {
          const duplicate = await api.post<{ listing: MarketplaceListing }>(
            `/listings/${id}/duplicate`,
            {},
            token || undefined
          );
          counterpartId = duplicate.listing.id;
        } catch {
          const existing = await api.get<{ listings: MarketplaceListing[] }>(
            `/listings?inventoryItemId=${listing?.inventoryItemId}&marketplace=${otherMarketplace}`,
            token || undefined
          );
          counterpartId = existing.listings.find((candidate) => candidate.status === 'Draft')?.id || null;
        }

        if (!counterpartId) {
          throw new Error(`Could not prepare the ${otherMarketplace} listing`);
        }
        await api.post(`/listings/${counterpartId}/publish`, {}, token || undefined);
      } else if (publishTarget === 'Etsy' || publishTarget === 'Ebay') {
        if (listing?.marketplace === publishTarget) {
          await api.post(`/listings/${id}/publish`, {}, token || undefined);
        } else {
          // Duplicate to target marketplace
          const dupRes = await api.post<{ listing: MarketplaceListing }>(
            `/listings/${id}/duplicate`,
            {},
            token || undefined
          );
          await api.post(`/listings/${dupRes.listing.id}/publish`, {}, token || undefined);
        }
      }
      setShowPublishConfirm(false);
      setSuccessMsg('Published successfully!');
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async () => {
    if (!id || !confirm('Are you sure you want to end this listing?')) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/listings/${id}/end`, {}, token || undefined);
      setSuccessMsg('Listing ended');
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end listing');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateSale = async () => {
    if (!id || !confirm('Simulate a paid sale on this prototype marketplace? The linked listing on the other marketplace will be ended automatically.')) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post(`/listings/${id}/simulate-sale`, {}, token || undefined);
      setSuccessMsg('Prototype sale recorded. Linked marketplace listings were closed.');
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate sale');
    } finally {
      setSaving(false);
    }
  };

  const togglePhotoOrder = (photoId: string) => {
    setForm((prev) => {
      const current = prev.photoOrder;
      if (current.includes(photoId)) {
        return { ...prev, photoOrder: current.filter((p) => p !== photoId) };
      } else {
        return { ...prev, photoOrder: [...current, photoId] };
      }
    });
  };

  const movePhotoUp = (photoId: string) => {
    setForm((prev) => {
      const arr = [...prev.photoOrder];
      const idx = arr.indexOf(photoId);
      if (idx > 0) {
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      }
      return { ...prev, photoOrder: arr };
    });
  };

  const movePhotoDown = (photoId: string) => {
    setForm((prev) => {
      const arr = [...prev.photoOrder];
      const idx = arr.indexOf(photoId);
      if (idx < arr.length - 1) {
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      }
      return { ...prev, photoOrder: arr };
    });
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!listing && !isNew) return <div className="text-center py-12 text-gray-400">Listing not found</div>;

  const item = listing?.inventoryItem;
  const titleLen = form.title.length;
  const titleOverLimit = titleLen > ETSY_TITLE_MAX;

  // Compute warnings from completeness
  const completenessWarnings = completeness?.warnings || [];
  const computedWarnings: string[] = [];

  if (item) {
    if (!item.photos || item.photos.length === 0) computedWarnings.push('Missing photos');
    if (!item.dimensions && !item.weight) computedWarnings.push('Missing measurements');
    if (!item.conditionNotes) computedWarnings.push('Missing condition notes');
    if (item.purchaseCost === null || item.purchaseCost === undefined) computedWarnings.push('Missing cost info');
    if (!item.storageLocation) computedWarnings.push('Missing storage location');
    if (item.minAcceptablePrice !== null && form.price && parseFloat(form.price) < item.minAcceptablePrice) {
      computedWarnings.push('Price below minimum acceptable');
    }
    if (titleOverLimit) computedWarnings.push('Title too long (Etsy limit: 140 chars)');
    if (!form.marketplaceCategory) computedWarnings.push('Missing marketplace category');
    if (!form.shippingProfile) computedWarnings.push('Missing shipping profile');
  }

  const allWarnings = [...new Set([...completenessWarnings, ...computedWarnings])];
  const computedScore = completeness?.score || 0;
  const scoreColor = getCompletenessColor(computedScore);
  const scoreBg = getCompletenessBg(computedScore);

  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const inputClass = "input-field";

  const inputField = (name: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        name={name}
        type={type}
        value={String(form[name])}
        onChange={handleChange}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">
            {isNew ? 'New Listing' : `Listing: ${listing?.title}`}
          </h1>
          {listing?.inventoryItem && (
            <p className="text-gray-500 mt-1 text-sm">
              for{' '}
              <Link to={`/inventory/${listing.inventoryItemId}`} className="text-primary-600 hover:text-primary-700">
                {listing.inventoryItem.sku} — {listing.inventoryItem.title}
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/listings')} className="btn-secondary text-sm">
            Back to Listings
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {successMsg && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">{successMsg}</div>}

      {/* Completeness Score */}
      {!isNew && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Listing Completeness</h2>
            <span className={`text-2xl font-bold ${scoreColor}`}>{computedScore}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full">
            <div
              className={`h-3 rounded-full transition-all ${scoreBg}`}
              style={{ width: `${Math.min(computedScore, 100)}%` }}
            ></div>
          </div>
          {allWarnings.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Warnings:</p>
              {allWarnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-lg">
                  <span>⚠️</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Bar */}
      {!isNew && listing && (
        <div className="card mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-block px-2.5 py-1 text-sm rounded-full font-medium ${
              listing.status === 'Active' ? 'bg-green-100 text-green-700' :
              listing.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
              listing.status === 'Ended' ? 'bg-gray-100 text-gray-500' :
              listing.status === 'Sold' ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              Status: {listing.status}
            </span>

            {listing.status === 'Draft' && (
              <button onClick={() => { setPublishTarget(listing.marketplace as 'Etsy' | 'Ebay'); setShowPublishConfirm(true); }} className="btn-primary text-sm">
                Publish to {listing.marketplace}
              </button>
            )}

            {(listing.status === 'Draft' || listing.status === 'Active') && (
              <>
                <button onClick={() => { setPublishTarget('Both'); setShowPublishConfirm(true); }} className="btn-primary text-sm bg-teal-600 hover:bg-teal-700">
                  Publish to Both
                </button>
                {listing.status === 'Active' && (
                  <>
                    {listing.marketplaceAccount?.storeId?.startsWith('mock-') && (
                      <button onClick={handleSimulateSale} disabled={saving} className="btn-secondary text-sm">
                        Simulate Sale
                      </button>
                    )}
                    <button onClick={handleEnd} className="btn-secondary text-sm">
                      End Listing
                    </button>
                  </>
                )}
                <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm">
                  {saving ? 'Saving...' : listing.status === 'Active' ? 'Save Changes' : 'Save as Draft'}
                </button>
              </>
            )}

            <button onClick={() => setShowTemplatePicker(true)} className="btn-secondary text-sm">
              Load Template
            </button>
          </div>
        </div>
      )}

      {/* Publish Confirmation */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="font-semibold text-gray-900 mb-2">Confirm Publish</h2>
            <p className="text-sm text-gray-500 mb-4">
              {publishTarget === 'Both'
                ? 'Publish this item to both Etsy and eBay?'
                : `Publish this listing to ${publishTarget}?`}
            </p>
            {completeness && completeness.score < 60 && (
              <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg">
                ⚠️ Listing completeness is below 60%. The publish may be rejected.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowPublishConfirm(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handlePublish} disabled={saving} className="btn-primary text-sm">
                {saving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[70vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-900 mb-4">Choose a Template</h2>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No templates yet.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                  >
                    <p className="font-medium text-gray-900">{tpl.name}</p>
                    <p className="text-xs text-gray-500">{tpl.category} · {tpl.titleTemplate || 'No title template'}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-between">
              <Link to="/listings/templates" className="text-sm text-primary-600 hover:text-primary-700">
                Manage Templates →
              </Link>
              <button onClick={() => setShowTemplatePicker(false)} className="btn-secondary text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="space-y-6">
        {/* Title & Description */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Title & Description</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Marketplace Title
                <span className={`ml-2 text-xs ${titleOverLimit ? 'text-red-500' : 'text-gray-400'}`}>
                  ({titleLen}/{ETSY_TITLE_MAX} chars)
                </span>
              </label>
              <input name="title" value={form.title} onChange={handleChange} className={inputClass} />
              {titleOverLimit && (
                <p className="text-xs text-red-500 mt-1">Exceeds Etsy's 140-character title limit</p>
              )}
            </div>

            {/* Tabs: Shared / Etsy / eBay */}
            <div className="border-b border-gray-200">
              <div className="flex gap-4">
                {(['shared', 'etsy', 'ebay'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-primary-500 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'shared' ? 'Master Description' : tab === 'etsy' ? 'Etsy Version' : 'eBay Version'}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'shared' && (
              <div>
                <label className={labelClass}>Master Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} className={inputClass} rows={5} />
              </div>
            )}
            {activeTab === 'etsy' && (
              <div>
                <label className={labelClass}>Etsy Description Override</label>
                <textarea name="etsyDescription" value={form.etsyDescription} onChange={handleChange} className={inputClass} rows={5} />
              </div>
            )}
            {activeTab === 'ebay' && (
              <div>
                <label className={labelClass}>eBay Description Override</label>
                <textarea name="ebayDescription" value={form.ebayDescription} onChange={handleChange} className={inputClass} rows={5} />
              </div>
            )}
          </div>
        </div>

        {/* Item Info (read-only preview) */}
        {item && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Inventory Item Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
              {item.metalType && <div><span className="text-gray-500">Metal:</span> <span className="font-medium">{item.metalType} {item.metalPurity || ''}</span></div>}
              {item.gemstoneType && <div><span className="text-gray-500">Gemstone:</span> <span className="font-medium">{item.gemstoneType}</span></div>}
              {item.estimatedEra && <div><span className="text-gray-500">Era:</span> <span className="font-medium">{item.estimatedEra}</span></div>}
              {item.condition && <div><span className="text-gray-500">Condition:</span> <span className="font-medium">{item.condition.replace(/([A-Z])/g, ' $1').trim()}</span></div>}
              {item.dimensions && <div><span className="text-gray-500">Dimensions:</span> <span className="font-medium">{item.dimensions}</span></div>}
              {item.weight && <div><span className="text-gray-500">Weight:</span> <span className="font-medium">{item.weight}</span></div>}
              {item.ringSize && <div><span className="text-gray-500">Ring Size:</span> <span className="font-medium">{item.ringSize}</span></div>}
              {item.brand && <div><span className="text-gray-500">Brand:</span> <span className="font-medium">{item.brand}</span></div>}
            </div>
          </div>
        )}

        {/* Materials & Measurements (marketplace specific) */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Materials & Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inputField('tags', 'Tags / Keywords (comma-separated)')}
            {inputField('marketplaceCategory', 'Marketplace Category')}
          </div>
        </div>

        {/* Pricing */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {inputField('price', 'Price ($)', 'number')}
            {inputField('quantity', 'Quantity', 'number')}
            <div>
              <label className={labelClass}>Shipping Profile</label>
              <input name="shippingProfile" value={form.shippingProfile} onChange={handleChange} className={inputClass} placeholder="e.g. Free Shipping" />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass}>Return Policy</label>
            <input name="returnPolicy" value={form.returnPolicy} onChange={handleChange} className={inputClass} placeholder="e.g. 14-day returns accepted" />
          </div>

          {item?.minAcceptablePrice && parseFloat(form.price) < item.minAcceptablePrice && (
            <p className="text-xs text-red-500 mt-2">
              ⚠️ Price (${parseFloat(form.price).toFixed(2)}) is below minimum acceptable (${item.minAcceptablePrice.toFixed(2)})
            </p>
          )}
        </div>

        {/* Photo Order */}
        {item && item.photos && item.photos.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Photo Order</h2>
            <p className="text-sm text-gray-500 mb-3">
              Click photos to include them in the listing order. Use arrows to reorder.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...item.photos]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((photo) => {
                  const isIncluded = form.photoOrder.includes(photo.id);
                  const orderIdx = form.photoOrder.indexOf(photo.id);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => togglePhotoOrder(photo.id)}
                      className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-colors ${
                        isIncluded ? 'border-primary-400' : 'border-gray-200 opacity-50'
                      }`}
                    >
                      <img
                        src={`/uploads/${photo.filename}`}
                        alt={photo.originalName}
                        className="w-full h-32 object-cover"
                      />
                      {isIncluded && (
                        <div className="absolute top-1 left-1 bg-primary-500 text-white text-xs px-1.5 py-0.5 rounded">
                          #{orderIdx + 1}
                        </div>
                      )}
                      {isIncluded && (
                        <div className="absolute bottom-0 inset-x-0 flex justify-center gap-1 p-1 bg-black/30">
                          <button
                            onClick={(e) => { e.stopPropagation(); movePhotoUp(photo.id); }}
                            className="bg-white/80 p-0.5 rounded text-xs"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); movePhotoDown(photo.id); }}
                            className="bg-white/80 p-0.5 rounded text-xs"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePhotoOrder(photo.id); }}
                            className="bg-white/80 p-0.5 rounded text-xs text-red-500"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Etsy-specific fields */}
        <div className="card">
          <button
            onClick={() => setShowEtsyFields(!showEtsyFields)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="font-semibold text-gray-900">Etsy-Specific Fields</h2>
            <span className="text-gray-400 text-sm">{showEtsyFields ? '▴' : '▾'}</span>
          </button>
          {showEtsyFields && (
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Materials</label>
                <input name="etsyMaterials" value={form.etsyMaterials} onChange={handleChange} className={inputClass} placeholder="e.g. Sterling Silver, Garnet" />
              </div>
              <div>
                <label className={labelClass}>Era</label>
                <input name="etsyEra" value={form.etsyEra} onChange={handleChange} className={inputClass} placeholder="e.g. Victorian" />
              </div>
              <div>
                <label className={labelClass}>Additional Condition</label>
                <input name="etsyConditionExtra" value={form.etsyConditionExtra} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          )}
        </div>

        {/* eBay-specific fields */}
        <div className="card">
          <button
            onClick={() => setShowEbayFields(!showEbayFields)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="font-semibold text-gray-900">eBay-Specific Fields</h2>
            <span className="text-gray-400 text-sm">{showEbayFields ? '▴' : '▾'}</span>
          </button>
          {showEbayFields && (
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Item Specifics</label>
                <input name="ebayItemSpecifics" value={form.ebayItemSpecifics} onChange={handleChange} className={inputClass} placeholder="e.g. Type: Ring, Metal: Gold" />
              </div>
              <div>
                <label className={labelClass}>Condition Grade</label>
                <input name="ebayConditionGrade" value={form.ebayConditionGrade} onChange={handleChange} className={inputClass} placeholder="e.g. Pre-owned" />
              </div>
              <div>
                <label className={labelClass}>Shipping Weight (oz)</label>
                <input name="ebayShippingWeight" value={form.ebayShippingWeight} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          )}
        </div>

        {/* Save/Cancel */}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={() => navigate('/listings')} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
