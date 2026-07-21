import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface OrderItem {
  id: string;
  salePrice: number;
  quantity: number;
  inventoryItem: { id: string; title: string; sku: string } | null;
}

interface Transaction {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  transactionDate: string;
  marketplace: string;
}

interface Order {
  id: string;
  orderNumber: string;
  marketplace: string;
  marketplaceOrderId: string;
  buyerName: string | null;
  buyerUsername: string | null;
  buyerEmail: string | null;
  saleDate: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippingDeadline: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  shippingCost: number;
  insuranceCost: number;
  salesTaxCollected: number;
  notes: string | null;
  orderItems: OrderItem[];
  transactions: Transaction[];
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function OrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { token } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [shippingDeadline, setShippingDeadline] = useState('');

  const fetchOrder = async () => {
    try {
      const res = await api.get<{ order: Order }>(`/orders/${orderId}`, token || undefined);
      setOrder(res.order);
      setFulfillmentStatus(res.order.fulfillmentStatus);
      setTrackingNumber(res.order.trackingNumber || '');
      setShippingCarrier(res.order.shippingCarrier || '');
      setShippingDeadline(res.order.shippingDeadline ? res.order.shippingDeadline.split('T')[0] : '');
    } catch (err) {
      console.error('Failed to fetch order:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrder(); }, [orderId, token]);

  const updateOrder = async () => {
    setSaving(true);
    try {
      const res = await api.put<{ order: Order }>(`/orders/${orderId}`, {
        fulfillmentStatus,
        trackingNumber: trackingNumber || undefined,
        shippingCarrier: shippingCarrier || undefined,
        shippingDeadline: shippingDeadline || undefined,
      }, token || undefined);
      setOrder(res.order);
      setStatusMsg('Order updated successfully');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setStatusMsg('Error: ' + (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  const processRefund = async () => {
    try {
      const res = await api.post<{ order: Order }>(`/orders/${orderId}/refund`, {
        amount: refundAmount ? parseFloat(refundAmount) : undefined,
        reason: refundReason,
      }, token || undefined);
      setOrder(res.order);
      setFulfillmentStatus(res.order.fulfillmentStatus);
      setShowRefund(false);
      setStatusMsg('Refund processed');
    } catch (err) {
      setStatusMsg('Error: ' + (err instanceof Error ? err.message : 'Failed'));
    }
  };

  const processReturn = async () => {
    try {
      const res = await api.post<{ order: Order }>(`/orders/${orderId}/return`, {
        reason: returnReason,
      }, token || undefined);
      setOrder(res.order);
      setFulfillmentStatus(res.order.fulfillmentStatus);
      setShowReturn(false);
      setStatusMsg('Return processed');
    } catch (err) {
      setStatusMsg('Error: ' + (err instanceof Error ? err.message : 'Failed'));
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading order...</div>;
  if (!order) return <div className="text-center py-12 text-gray-400">Order not found</div>;

  const totalSale = order.orderItems.reduce((sum, oi) => sum + oi.salePrice * oi.quantity, 0);
  const totalFees = order.transactions
    .filter(t => t.type === 'Fee' || t.type === 'Refund')
    .reduce((sum, t) => sum + t.amount, 0);
  const net = totalSale - totalFees - order.shippingCost - order.salesTaxCollected;

  const isOverdue = order.fulfillmentStatus === 'AwaitingShipment' &&
    order.shippingDeadline && new Date(order.shippingDeadline) < new Date();

  const fmtCond = (s: string) => s.replace(/([A-Z])/g, ' $1').trim();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="btn-secondary text-sm">← Back to Orders</button>
        <h1 className="font-serif font-bold text-2xl text-gray-900">Order {order.orderNumber}</h1>
      </div>

      {statusMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          statusMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Order Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-gray-500">Order #</span><p className="font-medium">{order.orderNumber}</p></div>
              <div><span className="text-gray-500">Marketplace</span><p>
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                  order.marketplace === 'Etsy' ? 'bg-orange-100 text-orange-700' :
                  order.marketplace === 'Ebay' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                }`}>{order.marketplace}</span>
              </p></div>
              <div><span className="text-gray-500">Sale Date</span><p className="font-medium">{new Date(order.saleDate).toLocaleDateString()}</p></div>
              <div><span className="text-gray-500">Buyer</span><p className="font-medium">{order.buyerName || order.buyerUsername || '-'}</p></div>
              <div><span className="text-gray-500">Payment</span><p>
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                  order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' :
                  order.paymentStatus === 'Refunded' ? 'bg-red-100 text-red-700' :
                  order.paymentStatus === 'PartiallyRefunded' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{fmtCond(order.paymentStatus)}</span>
              </p></div>
              <div><span className="text-gray-500">Fulfillment</span><p>
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                  order.fulfillmentStatus === 'AwaitingShipment' ? (isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700') :
                  order.fulfillmentStatus === 'Shipped' || order.fulfillmentStatus === 'Delivered' ? 'bg-green-100 text-green-700' :
                  order.fulfillmentStatus === 'Cancelled' || order.fulfillmentStatus === 'Returned' ? 'bg-gray-100 text-gray-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{fmtCond(order.fulfillmentStatus)}</span>
                {isOverdue && <span className="text-red-600 text-xs ml-2 font-bold">OVERDUE</span>}
              </p></div>
              {order.trackingNumber && <div><span className="text-gray-500">Tracking</span><p className="font-mono text-xs font-medium">{order.trackingNumber}</p></div>}
            </div>
            {order.notes && <div className="mt-4 pt-4 border-t border-gray-100"><span className="text-xs text-gray-500">Notes</span><p className="text-sm mt-1">{order.notes}</p></div>}
          </div>

          {/* Order Items */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Items</h2>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Item</th>
                  <th className="table-header">SKU</th>
                  <th className="table-header">Price</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {order.orderItems.map((oi) => (
                  <tr key={oi.id}>
                    <td className="table-cell">
                      <Link to={`/inventory/${oi.inventoryItem?.id}`} className="text-primary-600 hover:text-primary-700">
                        {oi.inventoryItem?.title || 'Unknown'}
                      </Link>
                    </td>
                    <td className="table-cell font-mono text-xs">{oi.inventoryItem?.sku || '-'}</td>
                    <td className="table-cell">{formatCurrency(oi.salePrice)}</td>
                    <td className="table-cell">{oi.quantity}</td>
                    <td className="table-cell font-medium">{formatCurrency(oi.salePrice * oi.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Transactions */}
          {order.transactions.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Transactions</h2>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Type</th>
                    <th className="table-header">Description</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          t.type === 'Revenue' ? 'bg-green-100 text-green-700' :
                          t.type === 'Refund' ? 'bg-red-100 text-red-700' :
                          t.type === 'Fee' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{t.type}</span>
                      </td>
                      <td className="table-cell text-sm">{t.description || '-'}</td>
                      <td className="table-cell font-medium">{formatCurrency(t.amount)}</td>
                      <td className="table-cell text-xs">{new Date(t.transactionDate).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right sidebar: Fulfillment + Financial */}
        <div className="space-y-6">
          {/* Fulfillment Management */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Fulfillment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={fulfillmentStatus} onChange={(e) => setFulfillmentStatus(e.target.value)} className="input-field">
                  {['AwaitingPayment', 'AwaitingShipment', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'ReturnRequested', 'Returned', 'Refunded'].map(s => (
                    <option key={s} value={s}>{fmtCond(s)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
                <input value={shippingCarrier} onChange={(e) => setShippingCarrier(e.target.value)} className="input-field" placeholder="USPS, UPS, FedEx..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tracking #</label>
                <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input-field" placeholder="Enter tracking number" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Deadline</label>
                <input type="date" value={shippingDeadline} onChange={(e) => setShippingDeadline(e.target.value)} className="input-field" />
              </div>
              <button onClick={updateOrder} disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving...' : 'Update Fulfillment'}
              </button>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Financial Breakdown</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Sale Price</span><span className="font-medium">{formatCurrency(totalSale)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Marketplace Fees</span><span className="font-medium text-red-600">-{formatCurrency(totalFees)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="font-medium text-red-600">-{formatCurrency(order.shippingCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Sales Tax</span><span className="font-medium text-red-600">-{formatCurrency(order.salesTaxCollected)}</span></div>
              <hr className="my-2" />
              <div className="flex justify-between font-semibold"><span>Net</span><span className={net >= 0 ? 'text-green-700' : 'text-red-700'}>{formatCurrency(net)}</span></div>
            </div>
          </div>

          {/* Refund / Return */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              <button onClick={() => setShowRefund(true)} className="btn-secondary w-full text-sm">Process Refund</button>
              <button onClick={() => setShowReturn(true)} className="btn-secondary w-full text-sm">Process Return</button>
            </div>
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {showRefund && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowRefund(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Process Refund</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input type="number" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="input-field" placeholder={`Total: ${totalSale.toFixed(2)}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="input-field" placeholder="Optional reason" />
              </div>
              <div className="flex gap-3">
                <button onClick={processRefund} className="btn-danger flex-1">Confirm Refund</button>
                <button onClick={() => setShowRefund(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowReturn(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Process Return</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="input-field" placeholder="Optional reason" />
              </div>
              <div className="flex gap-3">
                <button onClick={processReturn} className="btn-danger flex-1">Confirm Return</button>
                <button onClick={() => setShowReturn(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const idFromUrl = paramId || searchParams.get('id');

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(idFromUrl);
  const [sortField, setSortField] = useState('saleDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [awaitingShipmentCount, setAwaitingShipmentCount] = useState(0);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (marketplaceFilter) params.set('marketplace', marketplaceFilter);
      if (fulfillmentFilter) params.set('fulfillmentStatus', fulfillmentFilter);
      if (paymentFilter) params.set('paymentStatus', paymentFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await api.get<{ orders: Order[]; pagination: Pagination }>(
        `/orders?${params.toString()}`,
        token || undefined
      );
      const sorted = [...res.orders].sort((a: any, b: any) => {
        if (sortField === 'orderNumber') {
          return sortDir === 'asc' ? a.orderNumber.localeCompare(b.orderNumber) : b.orderNumber.localeCompare(a.orderNumber);
        }
        return sortDir === 'asc' ? new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime() : new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime();
      });
      setOrders(sorted);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAwaitingCount = async () => {
    try {
      const params = new URLSearchParams();
      params.set('fulfillmentStatus', 'AwaitingShipment');
      params.set('limit', '1');
      const res = await api.get<{ orders: Order[]; pagination: Pagination }>(
        `/orders?${params.toString()}`,
        token || undefined
      );
      setAwaitingShipmentCount(res.pagination.total);
    } catch {}
  };

  useEffect(() => { fetchOrders(); fetchAwaitingCount(); }, [page, marketplaceFilter, fulfillmentFilter, paymentFilter, startDate, endDate, sortField, sortDir, token]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const fmtCond = (s: string) => s.replace(/([A-Z])/g, ' $1').trim();

  if (selectedOrderId) {
    return <OrderDetail orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Orders</h1>
          <p className="text-gray-500 mt-1">
            {awaitingShipmentCount > 0 && (
              <span className="text-orange-600">{awaitingShipmentCount} awaiting shipment</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={marketplaceFilter} onChange={(e) => setMarketplaceFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Marketplaces</option>
            <option value="Etsy">Etsy</option>
            <option value="Ebay">eBay</option>
            <option value="Manual">Manual</option>
            <option value="Other">Other</option>
          </select>
          <select value={fulfillmentFilter} onChange={(e) => setFulfillmentFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Fulfillment</option>
            {['AwaitingPayment', 'AwaitingShipment', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'ReturnRequested', 'Returned', 'Refunded'].map(s => (
              <option key={s} value={s}>{fmtCond(s)}</option>
            ))}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Payment</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Refunded">Refunded</option>
            <option value="PartiallyRefunded">Partially Refunded</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-auto" title="Start date" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-auto" title="End date" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No orders found</p>
          <p className="text-sm">Orders will appear here when sales are recorded or imported from marketplaces.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header cursor-pointer hover:text-gray-700" onClick={() => handleSort('orderNumber')}>
                    Order # {sortField === 'orderNumber' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="table-header">Marketplace</th>
                  <th className="table-header">Item</th>
                  <th className="table-header">Buyer</th>
                  <th className="table-header cursor-pointer hover:text-gray-700" onClick={() => handleSort('saleDate')}>
                    Sale Date {sortField === 'saleDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="table-header">Payment</th>
                  <th className="table-header">Fulfillment</th>
                  <th className="table-header">Tracking</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => {
                  const isOverdue = order.fulfillmentStatus === 'AwaitingShipment' &&
                    order.shippingDeadline && new Date(order.shippingDeadline) < new Date();
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedOrderId(order.id)}>
                      <td className="table-cell font-mono text-xs">{order.orderNumber}</td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          order.marketplace === 'Etsy' ? 'bg-orange-100 text-orange-700' :
                          order.marketplace === 'Ebay' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>{order.marketplace}</span>
                      </td>
                      <td className="table-cell max-w-[200px] truncate">
                        {order.orderItems[0]?.inventoryItem?.title || 'Unknown'}
                      </td>
                      <td className="table-cell">{order.buyerName || order.buyerUsername || '-'}</td>
                      <td className="table-cell text-xs">{new Date(order.saleDate).toLocaleDateString()}</td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' :
                          order.paymentStatus === 'Refunded' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                        }`}>{fmtCond(order.paymentStatus)}</span>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                          isOverdue ? 'bg-red-100 text-red-700' :
                          order.fulfillmentStatus === 'AwaitingShipment' ? 'bg-yellow-100 text-yellow-700' :
                          order.fulfillmentStatus === 'Shipped' || order.fulfillmentStatus === 'Delivered' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {fmtCond(order.fulfillmentStatus)}
                          {isOverdue && ' ⚠️'}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-xs max-w-[120px] truncate">
                        {order.trackingNumber || '-'}
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedOrderId(order.id); }}
                          className="text-primary-600 hover:text-primary-700 text-sm"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
