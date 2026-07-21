import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface DashboardData {
  totalActiveItems: number;
  totalInventoryCost: number;
  totalAskingPriceValue: number;
  revenueThisMonth: number;
  estimatedProfitThisMonth: number;
  ordersAwaitingShipment: number;
  totalExpensesThisMonth: number;
  itemsAwaitingShipment: number;
  agingInventoryCount: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  marketplace: string;
  buyerName: string | null;
  saleDate: string;
  paymentStatus: string;
  orderItems: { salePrice: number; inventoryItem: { title: string; sku: string } | null }[];
}

interface Alerts {
  total: number;
  breakdown: { needsPhotos: number; needsResearch: number; aging: number; draft: number };
}

export default function Dashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentSales, setRecentSales] = useState<RecentOrder[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [summaryRes, salesRes, alertsRes] = await Promise.all([
          api.get<DashboardData>('/dashboard/summary', token || undefined),
          api.get<{ orders: RecentOrder[] }>('/dashboard/recent-sales', token || undefined),
          api.get<Alerts>('/dashboard/alerts', token || undefined),
        ]);
        setData(summaryRes);
        setRecentSales(salesRes.orders);
        setAlerts(alertsRes);
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [token]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif font-bold text-2xl text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your jewelry inventory</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { label: 'Total Active Items', value: data.totalActiveItems, color: 'bg-blue-50 border-blue-200', icon: '💎' },
    { label: 'Total Inventory Cost', value: formatCurrency(data.totalInventoryCost), color: 'bg-slate-50 border-slate-200', icon: '📋' },
    { label: 'Total Asking Price', value: formatCurrency(data.totalAskingPriceValue), color: 'bg-amber-50 border-amber-200', icon: '💵' },
    { label: 'Revenue This Month', value: formatCurrency(data.revenueThisMonth), color: 'bg-green-50 border-green-200', icon: '💰', link: '/revenue' },
    { label: 'Est. Profit This Month', value: formatCurrency(data.estimatedProfitThisMonth), color: 'bg-emerald-50 border-emerald-200', icon: '📈', link: '/revenue' },
    { label: 'Awaiting Shipment', value: data.itemsAwaitingShipment, color: 'bg-orange-50 border-orange-200', icon: '📦', link: '/orders' },
    { label: 'Aging (>90 days)', value: data.agingInventoryCount, color: 'bg-red-50 border-red-200', icon: '⏳' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your jewelry inventory</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`card border-2 ${card.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900">{card.value}</p>
            {card.link && (
              <Link to={card.link} className="text-xs text-primary-600 hover:text-primary-700 mt-1 inline-block">
                View details →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Alerts Banner */}
      {alerts && alerts.total > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <div>
              <p className="font-medium text-yellow-800">{alerts.total} item{alerts.total !== 1 ? 's' : ''} requiring attention</p>
              <p className="text-sm text-yellow-600">
                {alerts.breakdown.needsPhotos > 0 && `${alerts.breakdown.needsPhotos} need photos · `}
                {alerts.breakdown.needsResearch > 0 && `${alerts.breakdown.needsResearch} need research · `}
                {alerts.breakdown.aging > 0 && `${alerts.breakdown.aging} aging · `}
                {alerts.breakdown.draft > 0 && `${alerts.breakdown.draft} drafts`}
              </p>
            </div>
          </div>
          <Link to="/actions" className="text-sm font-medium text-yellow-700 hover:text-yellow-800">
            View All →
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Sales</h2>
            <Link to="/orders" className="text-sm text-primary-600 hover:text-primary-700">View All →</Link>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-gray-400 text-sm">No sales recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Order #</th>
                    <th className="table-header">Item</th>
                    <th className="table-header">Buyer</th>
                    <th className="table-header">Price</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Marketplace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentSales.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{order.orderNumber}</td>
                      <td className="table-cell">
                        {order.orderItems[0]?.inventoryItem?.title || 'Unknown'}
                      </td>
                      <td className="table-cell">{order.buyerName || '-'}</td>
                      <td className="table-cell font-medium">
                        {formatCurrency(order.orderItems.reduce((s, oi) => s + oi.salePrice, 0))}
                      </td>
                      <td className="table-cell text-xs">
                        {new Date(order.saleDate).toLocaleDateString()}
                      </td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          order.marketplace === 'Etsy' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {order.marketplace}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link to="/inventory/new" className="btn-primary block text-center text-sm w-full">
                + Add Item
              </Link>
              <Link to="/inventory" className="btn-secondary block text-center text-sm w-full">
                View Inventory
              </Link>
              <Link to="/orders" className="btn-secondary block text-center text-sm w-full">
                {data.ordersAwaitingShipment > 0 ? `Orders (${data.ordersAwaitingShipment} to ship)` : 'Orders'}
              </Link>
              <Link to="/expenses" className="btn-secondary block text-center text-sm w-full">
                + Add Expense
              </Link>
              <Link to="/actions" className="btn-secondary block text-center text-sm w-full">
                Action Center {alerts ? `(${alerts.total})` : ''}
              </Link>
            </div>
          </div>

          {/* Financial Quick Links */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Financial</h2>
            <div className="space-y-2">
              <Link to="/revenue" className="btn-secondary block text-center text-sm w-full">
                Revenue Dashboard
              </Link>
              <Link to="/calculator" className="btn-secondary block text-center text-sm w-full">
                Profit Calculator
              </Link>
            </div>
          </div>

          {/* Sync Status */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Sync Status</h2>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span>
              <span className="text-sm text-gray-600">No marketplaces connected</span>
            </div>
            <Link to="/integrations" className="text-xs text-primary-600 hover:text-primary-700 mt-2 inline-block">
              Connect a marketplace →
            </Link>
          </div>

          {/* Items Summary */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Inventory Snapshot</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Awaiting Shipment</span>
                <Link to="/orders" className="font-medium text-primary-600">{data.itemsAwaitingShipment}</Link>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Aging (90+ days)</span>
                <span className="font-medium">{data.agingInventoryCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Active</span>
                <span className="font-medium">{data.totalActiveItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Expenses This Month</span>
                <Link to="/expenses" className="font-medium text-primary-600">{formatCurrency(data.totalExpensesThisMonth)}</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
