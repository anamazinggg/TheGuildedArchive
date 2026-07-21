import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#a855f7', '#ef4444'];

interface Overview {
  totalActiveItems: number;
  totalInventoryValue: number;
  totalInventoryCost: number;
  sellThroughRate: number;
  averageDaysToSell: number;
  averageSalePrice: number;
  averageProfitMargin: number;
  totalSold: number;
  totalListed: number;
}

interface MonthlyData {
  month: string;
  revenue: number;
  profit: number;
  fees: number;
  expenses: number;
  shipping: number;
}

interface MarketplaceData {
  name: string;
  revenue: number;
  profit: number;
}

interface CategoryPerf {
  name: string;
  sales: number;
  revenue: number;
  profit: number;
  avgProfit: number;
}

interface ItemPerf {
  id: string;
  title: string;
  sku: string;
  profit: number;
  salePrice: number;
  cost: number;
  days?: number;
  askingPrice?: number;
}

interface AgingDist {
  '0-30': number;
  '30-60': number;
  '60-90': number;
  '90-180': number;
  '180+': number;
}

interface AgingItem {
  id: string;
  title: string;
  sku: string;
  askingPrice: number;
  category: string;
  status: string;
  daysListed: number;
}

interface Insight {
  type: string;
  text: string;
}

interface PerfScore {
  id: string;
  title: string;
  sku: string;
  category: string;
  askingPrice: number;
  daysListed: number;
  views: number;
  score: number;
}

export default function Analytics() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceData[]>([]);
  const [categories, setCategories] = useState<CategoryPerf[]>([]);
  const [eras, setEras] = useState<{ name: string; sales: number; revenue: number }[]>([]);
  const [metals, setMetals] = useState<{ name: string; sales: number; revenue: number }[]>([]);
  const [gemstones, setGemstones] = useState<{ name: string; sales: number; revenue: number }[]>([]);
  const [topPerformers, setTopPerformers] = useState<ItemPerf[]>([]);
  const [bottomPerformers, setBottomPerformers] = useState<ItemPerf[]>([]);
  const [fastestSelling, setFastestSelling] = useState<ItemPerf[]>([]);
  const [slowestMoving, setSlowestMoving] = useState<ItemPerf[]>([]);
  const [agingDist, setAgingDist] = useState<AgingDist | null>(null);
  const [agingItems, setAgingItems] = useState<AgingItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [scores, setScores] = useState<PerfScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const qs = params.toString();

      const [overviewRes, revenueRes, perfRes, agingRes, insightsRes, scoresRes] = await Promise.all([
        api.get<Overview>(`/analytics/overview?${qs}`, token || undefined),
        api.get<{ monthly: MonthlyData[]; marketplace: MarketplaceData[] }>(`/analytics/revenue?${qs}`, token || undefined),
        api.get<{
          categories: CategoryPerf[];
          eras: { name: string; sales: number; revenue: number }[];
          metals: { name: string; sales: number; revenue: number }[];
          gemstones: { name: string; sales: number; revenue: number }[];
          topPerformers: ItemPerf[];
          bottomPerformers: ItemPerf[];
          fastestSelling: ItemPerf[];
          slowestMoving: ItemPerf[];
        }>(`/analytics/performance?${qs}`, token || undefined),
        api.get<{ distribution: AgingDist; items: AgingItem[] }>('/analytics/aging', token || undefined),
        api.get<{ insights: Insight[] }>('/analytics/insights', token || undefined),
        api.get<{ scores: PerfScore[] }>('/analytics/performance-scores', token || undefined),
      ]);

      setOverview(overviewRes);
      setMonthly(revenueRes.monthly);
      setMarketplace(revenueRes.marketplace);
      setCategories(perfRes.categories);
      setEras(perfRes.eras);
      setMetals(perfRes.metals);
      setGemstones(perfRes.gemstones);
      setTopPerformers(perfRes.topPerformers);
      setBottomPerformers(perfRes.bottomPerformers);
      setFastestSelling(perfRes.fastestSelling);
      setSlowestMoving(perfRes.slowestMoving);
      setAgingDist(agingRes.distribution);
      setAgingItems(agingRes.items);
      setInsights(insightsRes.insights);
      setScores(scoresRes.scores);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const formatPct = (n: number) => `${Math.round(n * 10) / 10}%`;

  const agingChartData = agingDist
    ? [
        { name: '0-30d', value: agingDist['0-30'] },
        { name: '30-60d', value: agingDist['30-60'] },
        { name: '60-90d', value: agingDist['60-90'] },
        { name: '90-180d', value: agingDist['90-180'] },
        { name: '180+d', value: agingDist['180+'] },
      ]
    : [];

  const scoreColor = (s: number) =>
    s >= 70 ? 'text-green-600' : s >= 40 ? 'text-yellow-600' : 'text-red-600';
  const scoreBg = (s: number) =>
    s >= 70 ? 'bg-green-100' : s >= 40 ? 'bg-yellow-100' : 'bg-red-100';

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif font-bold text-2xl text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Performance metrics and insights</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Performance metrics, trends, and actionable insights</p>
        </div>
        <div className="flex gap-2">
          <input
            type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="input-field w-auto text-sm"
          />
          <span className="self-center text-gray-400">–</span>
          <input
            type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="input-field w-auto text-sm"
          />
        </div>
      </div>

      {/* Plain-language Insights */}
      {insights.length > 0 && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((ins, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border text-sm ${
                ins.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                ins.type === 'positive' ? 'bg-green-50 border-green-200 text-green-800' :
                ins.type === 'tip' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                'bg-gray-50 border-gray-200 text-gray-700'
              }`}
            >
              {ins.text}
            </div>
          ))}
        </div>
      )}

      {/* Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active Items', value: overview.totalActiveItems, color: 'bg-blue-50 border-blue-200', icon: '💎' },
            { label: 'Inventory Value', value: formatCurrency(overview.totalInventoryValue), color: 'bg-amber-50 border-amber-200', icon: '💵' },
            { label: 'Inventory Cost', value: formatCurrency(overview.totalInventoryCost), color: 'bg-slate-50 border-slate-200', icon: '📋' },
            { label: 'Sell-Through Rate', value: formatPct(overview.sellThroughRate), color: 'bg-emerald-50 border-emerald-200', icon: '📊' },
            { label: 'Avg Days to Sell', value: overview.averageDaysToSell + ' days', color: 'bg-violet-50 border-violet-200', icon: '⏱️' },
            { label: 'Avg Sale Price', value: formatCurrency(overview.averageSalePrice), color: 'bg-green-50 border-green-200', icon: '💰' },
            { label: 'Avg Profit Margin', value: formatPct(overview.averageProfitMargin), color: 'bg-teal-50 border-teal-200', icon: '📈' },
            { label: 'Total Sold', value: overview.totalSold + ' / ' + overview.totalListed, color: 'bg-pink-50 border-pink-200', icon: '🏷️' },
          ].map((card) => (
            <div key={card.label} className={`card border-2 ${card.color}`}>
              <span className="text-2xl">{card.icon}</span>
              <p className="text-sm text-gray-500 mt-2">{card.label}</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts Row 1: Revenue & Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue by Month</h2>
          {monthly.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No revenue data</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Net Profit by Month</h2>
          {monthly.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No profit data</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                <Line type="monotone" dataKey="profit" stroke="#8b5cf6" name="Profit" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                <Line type="monotone" dataKey="revenue" stroke="#d1d5db" name="Revenue" strokeWidth={1} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2: Sales & Profit by Marketplace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Sales by Marketplace</h2>
          {marketplace.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={marketplace} cx="50%" cy="50%" outerRadius={100} dataKey="revenue"
                  label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {marketplace.map((_, idx) => <Cell key={`mp-${idx}`} fill={COLORS[idx]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Profit by Marketplace</h2>
          {marketplace.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={marketplace} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={50} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                <Bar dataKey="profit" fill="#10b981" name="Profit" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Horizontal Bar Charts: Categories, Eras, Metals, Gemstones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {[
          { title: 'Best-Selling Categories', data: categories, dataKey: 'revenue', name: 'Revenue' },
          { title: 'Best-Performing Eras', data: eras, dataKey: 'revenue', name: 'Revenue' },
          { title: 'Best-Performing Metals', data: metals, dataKey: 'revenue', name: 'Revenue' },
          { title: 'Best-Performing Gemstones', data: gemstones, dataKey: 'revenue', name: 'Revenue' },
        ].map(chart => (
          <div key={chart.title} className="card">
            <h2 className="font-semibold text-gray-900 mb-4">{chart.title}</h2>
            {chart.data.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chart.data.length * 35 + 30)}>
                <BarChart data={chart.data.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                  <Bar dataKey={chart.dataKey} fill="#6366f1" name={chart.name} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      {/* Top/Bottom Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">🏆 Highest Profit Items</h2>
          {topPerformers.length === 0 ? (
            <p className="text-gray-400 text-sm">No sales data yet.</p>
          ) : (
            <div className="space-y-2">
              {topPerformers.map((item, i) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.sku}</p>
                  </div>
                  <span className="text-sm font-bold text-green-600 ml-3 whitespace-nowrap">
                    {formatCurrency(item.profit)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">⚠️ Lowest Profit Items</h2>
          {bottomPerformers.length === 0 ? (
            <p className="text-gray-400 text-sm">No sales data yet.</p>
          ) : (
            <div className="space-y-2">
              {bottomPerformers.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.sku}</p>
                  </div>
                  <span className={`text-sm font-bold ml-3 whitespace-nowrap ${item.profit >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                    {formatCurrency(item.profit)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fastest & Slowest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">⚡ Fastest-Selling Items</h2>
          {fastestSelling.length === 0 ? (
            <p className="text-gray-400 text-sm">No data.</p>
          ) : (
            <div className="space-y-2">
              {fastestSelling.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.sku}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-600 ml-3 whitespace-nowrap">
                    {item.days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">⏳ Slowest-Selling Items (90+ days)</h2>
          {slowestMoving.length === 0 ? (
            <p className="text-gray-400 text-sm">No items older than 90 days.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {slowestMoving.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.sku} · {formatCurrency(item.askingPrice || 0)}</p>
                  </div>
                  <span className="text-sm font-bold text-red-500 ml-3 whitespace-nowrap">
                    {item.days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Inventory Aging Distribution</h2>
          {agingChartData.every(d => d.value === 0) ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={agingChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" name="Items" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Aging Items</h2>
          {agingItems.length === 0 ? (
            <p className="text-gray-400 text-sm">No items.</p>
          ) : (
            <div className="overflow-y-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Days</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agingItems.slice(0, 20).map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-medium truncate block max-w-[180px]">{item.title}</span>
                        <span className="text-xs text-gray-400">{item.category}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-medium ${item.daysListed > 90 ? 'text-red-500' : item.daysListed > 60 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {item.daysListed}d
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.askingPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Performance Scores */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">📊 Performance Scores</h2>
        <p className="text-xs text-gray-400 mb-3">
          Score based on age, photos, category performance, views, and pricing. Higher is better.
        </p>
        {scores.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No active items to score.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Days Listed</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Views</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scores.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="font-medium">{item.title}</span>
                      <br /><span className="text-xs text-gray-400">{item.sku}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{item.category}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(item.askingPrice)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{item.daysListed}d</td>
                    <td className="px-4 py-2 text-right text-gray-500">{item.views || 0}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${scoreBg(item.score)} ${scoreColor(item.score)}`}>
                        {item.score}
                      </span>
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
