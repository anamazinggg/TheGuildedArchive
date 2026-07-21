import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

interface TransactionSummary {
  totalRevenue: number;
  totalFees: number;
  totalExpenses: number;
  totalShipping: number;
  totalTax: number;
  netProfit: number;
  profitMargin: number;
  averageOrderValue: number;
}

interface Transaction {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  transactionDate: string;
  marketplace: string;
  inventoryItem: { id: string; title: string; sku: string } | null;
  order: { id: string; orderNumber: string; marketplace: string } | null;
}

interface MonthlyData {
  month: string;
  revenue: number;
  profit: number;
  fees: number;
}

const COLORS = ['#f97316', '#3b82f6', '#6b7280', '#10b981'];

export default function Revenue() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [marketplaceData, setMarketplaceData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (marketplaceFilter) params.set('marketplace', marketplaceFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const [summaryRes, txRes] = await Promise.all([
        api.get<TransactionSummary>(`/transactions/summary?${params.toString()}`, token || undefined),
        api.get<{ transactions: Transaction[] }>(`/transactions?limit=10&${params.toString()}`, token || undefined),
      ]);
      setSummary(summaryRes);
      setTransactions(txRes.transactions);

      // Fetch all transactions for chart data
      const allTxRes = await api.get<{ transactions: Transaction[] }>(`/transactions?limit=500&${params.toString()}`, token || undefined);

      // Group by month
      const byMonth: Record<string, MonthlyData> = {};
      const byMarketplace: Record<string, number> = {};

      for (const tx of allTxRes.transactions) {
        const month = tx.transactionDate.substring(0, 7);
        if (!byMonth[month]) {
          byMonth[month] = { month, revenue: 0, profit: 0, fees: 0 };
        }
        if (tx.type === 'Revenue') {
          byMonth[month].revenue += tx.amount;
        } else if (tx.type === 'Fee' || tx.type === 'Shipping' || tx.type === 'Tax') {
          byMonth[month].fees += tx.amount;
        }

        // By marketplace
        const mp = tx.marketplace || 'Other';
        if (!byMarketplace[mp]) byMarketplace[mp] = 0;
        if (tx.type === 'Revenue') {
          byMarketplace[mp] += tx.amount;
        }
      }

      // Calculate profit
      const monthlyArr = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
      for (const m of monthlyArr) {
        m.profit = m.revenue - m.fees;
      }
      setMonthlyData(monthlyArr);

      const mpArr = Object.entries(byMarketplace).map(([name, value]) => ({ name, value }));
      setMarketplaceData(mpArr);
    } catch (err) {
      console.error('Failed to fetch revenue data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token, marketplaceFilter, startDate, endDate]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) {
    return (
      <div>
        <div className="mb-6"><h1 className="font-serif font-bold text-2xl text-gray-900">Revenue</h1></div>
        <div className="text-center py-12 text-gray-400">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Revenue</h1>
        <p className="text-gray-500 mt-1">Financial overview and profit tracking</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={marketplaceFilter} onChange={(e) => setMarketplaceFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Marketplaces</option>
            <option value="Etsy">Etsy</option>
            <option value="Ebay">eBay</option>
            <option value="Manual">Manual</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-auto" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-auto" />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Gross Sales', value: formatCurrency(summary.totalRevenue), color: 'bg-green-50 border-green-200', icon: '💰' },
            { label: 'Total Fees', value: formatCurrency(summary.totalFees + summary.totalShipping + summary.totalTax), color: 'bg-red-50 border-red-200', icon: '📉' },
            { label: 'Net Revenue', value: formatCurrency(summary.totalRevenue - summary.totalFees - summary.totalShipping - summary.totalTax), color: 'bg-blue-50 border-blue-200', icon: '💵' },
            { label: 'Estimated Profit', value: formatCurrency(summary.netProfit), color: 'bg-emerald-50 border-emerald-200', icon: '📈' },
          ].map((card) => (
            <div key={card.label} className={`card border-2 ${card.color}`}>
              <span className="text-2xl">{card.icon}</span>
              <p className="text-sm text-gray-500 mt-2">{card.label}</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue Bar Chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue by Month</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Profit Line Chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Profit Trend</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
                <Line type="monotone" dataKey="profit" stroke="#8b5cf6" name="Profit" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Marketplace Pie Chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Sales by Marketplace</h2>
          {marketplaceData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={marketplaceData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {marketplaceData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Key Metrics */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Key Metrics</h2>
          {summary ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Profit Margin</span>
                <span className={`text-xl font-bold ${summary.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {summary.profitMargin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Average Order Value</span>
                <span className="text-xl font-bold">{formatCurrency(summary.averageOrderValue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Total Fees</span>
                <span className="text-xl font-bold text-red-600">{formatCurrency(summary.totalFees)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Total Shipping Costs</span>
                <span className="text-xl font-bold">{formatCurrency(summary.totalShipping)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Sales Tax Collected</span>
                <span className="text-xl font-bold">{formatCurrency(summary.totalTax)}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No data</p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-gray-400 text-sm">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Marketplace</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="table-cell text-xs">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                    <td className="table-cell">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                        tx.type === 'Revenue' ? 'bg-green-100 text-green-700' :
                        tx.type === 'Fee' ? 'bg-yellow-100 text-yellow-700' :
                        tx.type === 'Refund' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{tx.type}</span>
                    </td>
                    <td className="table-cell">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        tx.marketplace === 'Etsy' ? 'bg-orange-100 text-orange-700' :
                        tx.marketplace === 'Ebay' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{tx.marketplace}</span>
                    </td>
                    <td className="table-cell font-medium">{formatCurrency(tx.amount)}</td>
                    <td className="table-cell text-sm text-gray-500">{tx.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center mb-6">
        Profit estimates are based on available data and may not reflect actual tax liabilities.
      </p>

      {/* Quick Links */}
      <div className="flex gap-4 justify-center">
        <Link to="/expenses" className="btn-secondary text-sm">Manage Expenses →</Link>
        <Link to="/calculator" className="btn-secondary text-sm">Profit Calculator →</Link>
        <Link to="/orders" className="btn-secondary text-sm">View Orders →</Link>
      </div>
    </div>
  );
}
