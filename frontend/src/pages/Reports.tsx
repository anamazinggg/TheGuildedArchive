import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  endpoint: string;
  filename: string;
  isPost?: boolean;
  isJson?: boolean;
}

const REPORTS: ReportCard[] = [
  {
    id: 'inventory',
    title: 'Active Inventory',
    description: 'Export CSV of all active inventory items with key fields: SKU, title, category, price, cost, location, tags.',
    icon: '💎',
    endpoint: '/reports/inventory',
    filename: 'inventory-export',
  },
  {
    id: 'sales',
    title: 'Sold Items Report',
    description: 'Export CSV of all sold items with sale date, price, marketplace, buyer info, and profit.',
    icon: '💰',
    endpoint: '/reports/sales',
    filename: 'sales-report',
  },
  {
    id: 'profit',
    title: 'Profit Report',
    description: 'Export per-item profit calculations: revenue, cost basis, fees, shipping, and net profit.',
    icon: '📈',
    endpoint: '/reports/profit',
    filename: 'profit-report',
  },
  {
    id: 'expenses',
    title: 'Expense Report',
    description: 'Export all expenses grouped by category. Includes vendor, payment method, and related items.',
    icon: '📉',
    endpoint: '/reports/expenses',
    filename: 'expense-report',
  },
  {
    id: 'tax',
    title: 'Tax Preparation Summary',
    description: 'Export annual summary: total revenue, fees, expenses, sales tax collected, grouped by marketplace for tax filing.',
    icon: '📋',
    endpoint: '/reports/tax',
    filename: 'tax-summary',
    isJson: true,
  },
  {
    id: 'backup',
    title: 'Full Backup',
    description: 'Download all business data as a JSON archive. Includes inventory, orders, transactions, listings, and settings. Sensitive data is redacted.',
    icon: '💾',
    endpoint: '/reports/backup',
    filename: 'gilded-archive-backup',
    isPost: true,
    isJson: true,
  },
];

function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) {
    alert('No data to export.');
    return;
  }
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { token } = useAuth();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [generatedTimestamps, setGeneratedTimestamps] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());

  const handleDownload = async (report: ReportCard) => {
    setLoadingId(report.id);
    try {
      let queryParams = '';
      if (['sales', 'profit', 'expenses'].includes(report.id)) {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        queryParams = params.toString() ? `?${params.toString()}` : '';
      }
      if (report.id === 'tax') {
        queryParams = `?year=${taxYear}`;
      }

      if (report.isPost) {
        const data = await api.post<any>(report.endpoint, {}, token || undefined);
        if (report.isJson) {
          downloadJSON(data, report.filename);
        }
        setGeneratedTimestamps(prev => ({ ...prev, [report.id]: new Date().toLocaleString() }));
      } else {
        const data = await api.get<any>(`${report.endpoint}${queryParams}`, token || undefined);
        if (data.rows && Array.isArray(data.rows)) {
          downloadCSV(data.rows, report.filename);
          setGeneratedTimestamps(prev => ({ ...prev, [report.id]: new Date().toLocaleString() }));
        } else if (report.isJson) {
          downloadJSON(data, report.filename);
          setGeneratedTimestamps(prev => ({ ...prev, [report.id]: new Date().toLocaleString() }));
        }
      }
    } catch (err) {
      console.error(`Download error for ${report.id}:`, err);
      alert(`Failed to generate report: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Reports & Exports</h1>
        <p className="text-gray-500 mt-1">Download your business data in CSV or JSON formats</p>
      </div>

      {/* Date Filters (for time-based reports) */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Date Range for Reports:</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-auto text-sm" />
          <span className="text-gray-400">–</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-auto text-sm" />
          <div className="border-l border-gray-200 pl-3 ml-2">
            <span className="text-sm font-medium text-gray-600 mr-2">Tax Year:</span>
            <input type="number" value={taxYear} onChange={(e) => setTaxYear(e.target.value)}
              className="input-field w-24 text-sm" min={2020} max={2030} />
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map(report => (
          <div key={report.id} className="card flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">{report.icon}</span>
              <div>
                <h2 className="font-semibold text-gray-900">{report.title}</h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{report.description}</p>
              </div>
            </div>

            {generatedTimestamps[report.id] && (
              <p className="text-xs text-gray-400 mb-3">
                Last generated: {generatedTimestamps[report.id]}
              </p>
            )}

            <div className="mt-auto pt-4">
              <button
                onClick={() => handleDownload(report)}
                disabled={loadingId === report.id}
                className="btn-primary w-full text-sm flex items-center justify-center gap-2"
              >
                {loadingId === report.id ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    ⬇ Download {report.isJson ? 'JSON' : 'CSV'}
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
