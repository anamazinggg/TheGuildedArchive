import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface FeeSettings {
  etsyTransactionFeePercent: number;
  etsyPaymentFeePercent: number;
  ebayFinalValueFeePercent: number;
  ebayPaymentFeePercent: number;
  shippingCostDefault: number;
  packagingCostDefault: number;
}

interface Estimate {
  estimatedFees: number;
  estimatedNetProceeds: number;
  estimatedProfit: number;
  estimatedProfitMargin: number;
  suggestedMinimumPrice: number;
}

export default function Calculator() {
  const { token } = useAuth();
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Form
  const [salePrice, setSalePrice] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [packagingCost, setPackagingCost] = useState('');
  const [advertisingCost, setAdvertisingCost] = useState('');
  const [additionalCosts, setAdditionalCosts] = useState('');

  // Results
  const [etsyEstimate, setEtsyEstimate] = useState<Estimate | null>(null);
  const [ebayEstimate, setEbayEstimate] = useState<Estimate | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Fee settings modal
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState<FeeSettings | null>(null);
  const [savingFees, setSavingFees] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const settings = await api.get<FeeSettings>('/calculator/fees', token || undefined);
        setFeeSettings(settings);
        setFeeForm(settings);
      } catch (err) {
        console.error('Failed to load fee settings:', err);
      } finally {
        setLoadingSettings(false);
      }
    }
    load();
  }, [token]);

  useEffect(() => {
    if (!salePrice) {
      setEtsyEstimate(null);
      setEbayEstimate(null);
      return;
    }
    setCalculating(true);
    const timer = setTimeout(async () => {
      try {
        const [etsyRes, ebayRes] = await Promise.all([
          api.post<Estimate>('/calculator/estimate', {
            salePrice: parseFloat(salePrice),
            purchaseCost: purchaseCost ? parseFloat(purchaseCost) : undefined,
            marketplace: 'etsy',
            shippingCost: shippingCost || undefined,
            packagingCost: packagingCost || undefined,
            advertisingCost: advertisingCost ? parseFloat(advertisingCost) : undefined,
            additionalCosts: additionalCosts ? parseFloat(additionalCosts) : undefined,
          }, token || undefined),
          api.post<Estimate>('/calculator/estimate', {
            salePrice: parseFloat(salePrice),
            purchaseCost: purchaseCost ? parseFloat(purchaseCost) : undefined,
            marketplace: 'ebay',
            shippingCost: shippingCost || undefined,
            packagingCost: packagingCost || undefined,
            advertisingCost: advertisingCost ? parseFloat(advertisingCost) : undefined,
            additionalCosts: additionalCosts ? parseFloat(additionalCosts) : undefined,
          }, token || undefined),
        ]);
        setEtsyEstimate(etsyRes);
        setEbayEstimate(ebayRes);
      } catch (err) {
        console.error('Calculation error:', err);
      } finally {
        setCalculating(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [salePrice, purchaseCost, shippingCost, packagingCost, advertisingCost, additionalCosts, token]);

  const saveFeeSettings = async () => {
    if (!feeForm) return;
    setSavingFees(true);
    try {
      const updated = await api.put<FeeSettings>('/calculator/fees', feeForm, token || undefined);
      setFeeSettings(updated);
      setShowFeeModal(false);
    } catch (err) {
      console.error('Failed to save fee settings:', err);
    } finally {
      setSavingFees(false);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loadingSettings) {
    return (
      <div>
        <div className="mb-6"><h1 className="font-serif font-bold text-2xl text-gray-900">Profit Calculator</h1></div>
        <div className="text-center py-12 text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Profit Calculator</h1>
          <p className="text-gray-500 mt-1">Estimate profitability before you list</p>
        </div>
        <button onClick={() => { setFeeForm({ ...(feeSettings || feeForm!) }); setShowFeeModal(true); }} className="btn-secondary text-sm">
          Fee Settings
        </button>
      </div>

      {/* Input Form */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Sale Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price ($) *</label>
            <input type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="input-field" placeholder="e.g., 250.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Cost ($)</label>
            <input type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} className="input-field" placeholder="e.g., 75.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Cost ($)</label>
            <input type="number" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className="input-field" placeholder={feeSettings?.shippingCostDefault?.toString() || '5.00'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Packaging Cost ($)</label>
            <input type="number" step="0.01" value={packagingCost} onChange={(e) => setPackagingCost(e.target.value)} className="input-field" placeholder={feeSettings?.packagingCostDefault?.toString() || '2.00'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Advertising Cost ($)</label>
            <input type="number" step="0.01" value={advertisingCost} onChange={(e) => setAdvertisingCost(e.target.value)} className="input-field" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Costs ($)</label>
            <input type="number" step="0.01" value={additionalCosts} onChange={(e) => setAdditionalCosts(e.target.value)} className="input-field" placeholder="0.00" />
          </div>
        </div>
      </div>

      {/* Results: Etsy vs eBay side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Etsy */}
        <div className="card border-2 border-orange-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">Etsy</span>
              Etsy Estimate
            </h2>
            <span className="text-xs text-gray-400">{feeSettings?.etsyTransactionFeePercent}% + {feeSettings?.etsyPaymentFeePercent}% + $0.25</span>
          </div>
          {calculating && !etsyEstimate ? (
            <p className="text-gray-400 text-sm">Calculating...</p>
          ) : etsyEstimate ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Estimated Fees</span><span className="font-medium text-red-600">{formatCurrency(etsyEstimate.estimatedFees)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Net Proceeds</span><span className="font-medium">{formatCurrency(etsyEstimate.estimatedNetProceeds)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Est. Profit</span><span className={`font-bold text-lg ${etsyEstimate.estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(etsyEstimate.estimatedProfit)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Profit Margin</span><span className={`font-bold ${etsyEstimate.estimatedProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{etsyEstimate.estimatedProfitMargin}%</span></div>
              <div className="flex justify-between py-2"><span className="text-gray-500">Suggested Min Price</span><span className="font-bold text-primary-600">{formatCurrency(etsyEstimate.suggestedMinimumPrice)}</span></div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Enter a sale price to see estimates.</p>
          )}
        </div>

        {/* eBay */}
        <div className="card border-2 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">eBay</span>
              eBay Estimate
            </h2>
            <span className="text-xs text-gray-400">{feeSettings?.ebayFinalValueFeePercent}% + {feeSettings?.ebayPaymentFeePercent}%</span>
          </div>
          {calculating && !ebayEstimate ? (
            <p className="text-gray-400 text-sm">Calculating...</p>
          ) : ebayEstimate ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Estimated Fees</span><span className="font-medium text-red-600">{formatCurrency(ebayEstimate.estimatedFees)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Net Proceeds</span><span className="font-medium">{formatCurrency(ebayEstimate.estimatedNetProceeds)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Est. Profit</span><span className={`font-bold text-lg ${ebayEstimate.estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(ebayEstimate.estimatedProfit)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Profit Margin</span><span className={`font-bold ${ebayEstimate.estimatedProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{ebayEstimate.estimatedProfitMargin}%</span></div>
              <div className="flex justify-between py-2"><span className="text-gray-500">Suggested Min Price</span><span className="font-bold text-primary-600">{formatCurrency(ebayEstimate.suggestedMinimumPrice)}</span></div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Enter a sale price to see estimates.</p>
          )}
        </div>
      </div>

      {/* Fee Settings Modal */}
      {showFeeModal && feeForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowFeeModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Fee Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Transaction Fee (%)</label>
                <input type="number" step="0.1" value={feeForm.etsyTransactionFeePercent} onChange={(e) => setFeeForm({ ...feeForm, etsyTransactionFeePercent: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Payment Fee (%)</label>
                <input type="number" step="0.1" value={feeForm.etsyPaymentFeePercent} onChange={(e) => setFeeForm({ ...feeForm, etsyPaymentFeePercent: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">eBay Final Value Fee (%)</label>
                <input type="number" step="0.1" value={feeForm.ebayFinalValueFeePercent} onChange={(e) => setFeeForm({ ...feeForm, ebayFinalValueFeePercent: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">eBay Payment Fee (%)</label>
                <input type="number" step="0.1" value={feeForm.ebayPaymentFeePercent} onChange={(e) => setFeeForm({ ...feeForm, ebayPaymentFeePercent: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Shipping Cost ($)</label>
                <input type="number" step="0.01" value={feeForm.shippingCostDefault} onChange={(e) => setFeeForm({ ...feeForm, shippingCostDefault: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Packaging Cost ($)</label>
                <input type="number" step="0.01" value={feeForm.packagingCostDefault} onChange={(e) => setFeeForm({ ...feeForm, packagingCostDefault: parseFloat(e.target.value) || 0 })} className="input-field" />
              </div>
              <div className="flex gap-3">
                <button onClick={saveFeeSettings} disabled={savingFees} className="btn-primary flex-1">{savingFees ? 'Saving...' : 'Save Settings'}</button>
                <button onClick={() => setShowFeeModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
