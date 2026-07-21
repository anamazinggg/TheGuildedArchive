import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

type Step = 'upload' | 'preview' | 'map' | 'confirm' | 'result';

interface ImportResult {
  summary: { created: number; updated: number; skipped: number; errors: number; total: number };
  errors: { row: number; message: string }[];
}

const fieldOptions = [
  { value: '', label: '— Skip —' },
  { value: 'sku', label: 'SKU' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'category', label: 'Category' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
  { value: 'condition', label: 'Condition' },
  { value: 'estimatedEra', label: 'Estimated Era' },
  { value: 'brand', label: 'Brand' },
  { value: 'metalType', label: 'Metal Type' },
  { value: 'metalPurity', label: 'Metal Purity' },
  { value: 'gemstoneType', label: 'Gemstone Type' },
  { value: 'gemstoneColor', label: 'Gemstone Color' },
  { value: 'ringSize', label: 'Ring Size' },
  { value: 'dimensions', label: 'Dimensions' },
  { value: 'weight', label: 'Weight' },
  { value: 'conditionNotes', label: 'Condition Notes' },
  { value: 'restorationHistory', label: 'Restoration History' },
  { value: 'authenticityNotes', label: 'Authenticity Notes' },
  { value: 'purchaseSource', label: 'Purchase Source' },
  { value: 'purchaseDate', label: 'Purchase Date' },
  { value: 'purchaseCost', label: 'Purchase Cost' },
  { value: 'restorationCost', label: 'Restoration Cost' },
  { value: 'cleaningCost', label: 'Cleaning Cost' },
  { value: 'appraisalCost', label: 'Appraisal Cost' },
  { value: 'packagingCost', label: 'Packaging Cost' },
  { value: 'shippingCost', label: 'Shipping Cost' },
  { value: 'askingPrice', label: 'Asking Price' },
  { value: 'minAcceptablePrice', label: 'Min Acceptable Price' },
];

function guessMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerFields: Record<string, string> = {
    'sku': 'sku', 'item #': 'sku', 'item#': 'sku', 'item number': 'sku',
    'title': 'title', 'name': 'title', 'product name': 'title',
    'description': 'description', 'details': 'description',
    'category': 'category', 'type': 'type', 'status': 'status',
    'condition': 'condition', 'era': 'estimatedEra', 'estimated era': 'estimatedEra',
    'brand': 'brand', 'maker': 'brand',
    'metal': 'metalType', 'metal type': 'metalType',
    'metal purity': 'metalPurity', 'purity': 'metalPurity',
    'gemstone': 'gemstoneType', 'stone': 'gemstoneType', 'gem': 'gemstoneType',
    'gemstone type': 'gemstoneType',
    'gemstone color': 'gemstoneColor', 'color': 'gemstoneColor',
    'ring size': 'ringSize', 'size': 'ringSize',
    'dimensions': 'dimensions', 'weight': 'weight',
    'condition notes': 'conditionNotes',
    'restoration': 'restorationHistory', 'restoration history': 'restorationHistory',
    'authenticity': 'authenticityNotes', 'authenticity notes': 'authenticityNotes',
    'purchase source': 'purchaseSource', 'source': 'purchaseSource',
    'purchase date': 'purchaseDate', 'date': 'purchaseDate',
    'purchase cost': 'purchaseCost', 'cost': 'purchaseCost', 'price paid': 'purchaseCost',
    'restoration cost': 'restorationCost',
    'cleaning cost': 'cleaningCost',
    'appraisal cost': 'appraisalCost',
    'packaging cost': 'packagingCost',
    'shipping cost': 'shippingCost',
    'asking price': 'askingPrice', 'price': 'askingPrice', 'asking': 'askingPrice',
    'min price': 'minAcceptablePrice', 'minimum price': 'minAcceptablePrice',
  };
  for (const col of columns) {
    const lower = col.toLowerCase().trim();
    if (lowerFields[lower]) {
      mapping[col] = lowerFields[lower];
    }
  }
  return mapping;
}

export default function InventoryImport() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [allRecords, setAllRecords] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.raw('/inventory/import/preview', {
        method: 'POST',
        body: formData,
        token: token || undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setColumns(data.columns);
      setPreview(data.preview);
      setAllRecords(data.allRecords);
      setTotalRows(data.totalRows);
      setMapping(guessMapping(data.columns));
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<ImportResult>('/inventory/import/confirm', {
        records: allRecords,
        mapping,
        skipDuplicates: false,
      }, token || undefined);
      setResult(res);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Import Inventory</h1>
          <p className="text-gray-500 mt-1">Import items from a CSV file</p>
        </div>
        <button onClick={() => navigate('/inventory')} className="btn-secondary">Back to Inventory</button>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {['Upload', 'Map Columns', 'Confirm', 'Done'].map((s, i) => {
          const stepNum = i + 1;
          const currentStep = step === 'upload' ? 1 : step === 'map' || step === 'preview' ? 2 : step === 'confirm' ? 3 : 4;
          const isActive = stepNum === currentStep;
          const isDone = stepNum < currentStep;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isDone ? 'bg-green-500 text-white' : isActive ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {isDone ? '✓' : stepNum}
              </div>
              <span className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{s}</span>
              {i < 3 && <div className="w-8 h-0.5 bg-gray-200"></div>}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="card max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Upload CSV File</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload a CSV file with your inventory data. The first row should contain column headers.
            Existing items (matching SKU) will be updated; new items will be created.
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-sm text-gray-600 font-medium">
                {file ? file.name : 'Click to select a CSV file'}
              </p>
              {file && <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
            </label>
          </div>
          <button
            onClick={handleFileSelect}
            disabled={!file || loading}
            className="btn-primary mt-4 w-full"
          >
            {loading ? 'Processing...' : 'Upload & Preview'}
          </button>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 'map' && (
        <div>
          {/* Preview table */}
          <div className="card mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Preview ({totalRows} rows total, showing first {preview.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">#</th>
                    {columns.map((col) => (
                      <th key={col} className="table-header">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preview.map((row, i) => (
                    <tr key={i}>
                      <td className="table-cell text-gray-400">{i + 1}</td>
                      {columns.map((col) => (
                        <td key={col} className="table-cell max-w-[200px] truncate">{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column mapping */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Map Columns</h2>
            <p className="text-sm text-gray-500 mb-4">
              For each CSV column, select which inventory field it maps to. At minimum, map the SKU field.
            </p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {columns.map((col) => (
                <div key={col} className="flex items-center gap-4">
                  <div className="w-1/2">
                    <p className="text-sm font-medium text-gray-700 truncate" title={col}>{col}</p>
                  </div>
                  <div className="w-1/2">
                    <select
                      value={mapping[col] || ''}
                      onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                      className="input-field text-sm"
                    >
                      {fieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setStep('upload'); setFile(null); }} className="btn-secondary">Back</button>
              <button onClick={() => setStep('confirm')} className="btn-primary">Review & Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="card max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Confirm Import</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Total rows</span>
              <span className="font-medium">{totalRows}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Mode</span>
              <span className="font-medium">Update if SKU exists, create if new</span>
            </div>
            <div className="py-2">
              <p className="text-gray-500 mb-2">Mapped fields:</p>
              <div className="space-y-1">
                {Object.entries(mapping).filter(([_, v]) => v).map(([col, field]) => (
                  <div key={col} className="text-xs bg-gray-100 rounded px-2 py-1 inline-block mr-2 mb-1">
                    {col} → {field}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-amber-600 mt-4">⚠️ This will create or update records. Existing data will not be deleted.</p>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setStep('map')} className="btn-secondary">Back</button>
            <button onClick={handleConfirm} disabled={loading} className="btn-primary">
              {loading ? 'Importing...' : `Import ${totalRows} Items`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && result && (
        <div className="card max-w-lg">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="font-semibold text-xl text-gray-900">Import Complete</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Created</span>
              <span className="font-medium text-green-600">{result.summary.created}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Updated</span>
              <span className="font-medium text-blue-600">{result.summary.updated}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Skipped / Errors</span>
              <span className="font-medium text-red-600">{result.summary.skipped}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Total Processed</span>
              <span className="font-bold">{result.summary.total}</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-red-700 mb-2">Errors:</h3>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    Row {e.row}: {e.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button onClick={() => { setStep('upload'); setFile(null); setResult(null); }} className="btn-secondary">
              Import Another
            </button>
            <button onClick={() => navigate('/inventory')} className="btn-primary">
              View Inventory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
