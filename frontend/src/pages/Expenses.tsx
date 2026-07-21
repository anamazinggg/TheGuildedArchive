import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

interface InventoryItem {
  id: string;
  title: string;
  sku: string;
}

interface Expense {
  id: string;
  category: string;
  vendor: string | null;
  amount: number;
  expenseDate: string;
  paymentMethod: string | null;
  receiptFilename: string | null;
  inventoryItemId: string | null;
  inventoryItem: { id: string; title: string; sku: string } | null;
  notes: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const EXPENSE_CATEGORIES = [
  'InventoryPurchase', 'PackagingSupplies', 'ShippingSupplies',
  'Appraisal', 'Repair', 'Cleaning', 'PhotographyEquipment',
  'MarketplaceSubscription', 'Advertising', 'Software', 'Mileage', 'Other',
];

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1', '#14b8a6', '#a855f7'];

const formatCategory = (c: string) => c.replace(/([A-Z])/g, ' $1').trim();

export default function Expenses() {
  const { token } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<{ id: string; title: string }[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  // Form state
  const [formCategory, setFormCategory] = useState('Other');
  const [formVendor, setFormVendor] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPaymentMethod, setFormPaymentMethod] = useState('');
  const [formInventoryItemId, setFormInventoryItemId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Chart data
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; amount: number }[]>([]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (categoryFilter) params.set('category', categoryFilter);
      if (vendorSearch) params.set('vendor', vendorSearch);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await api.get<{ expenses: Expense[]; pagination: Pagination }>(
        `/expenses?${params.toString()}`,
        token || undefined
      );
      setExpenses(res.expenses);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      const res = await api.get<{ expenses: Expense[] }>(`/expenses?${params.toString()}`, token || undefined);

      // By category
      const catMap: Record<string, number> = {};
      const monthMap: Record<string, number> = {};
      for (const e of res.expenses) {
        catMap[e.category] = (catMap[e.category] || 0) + e.amount;
        const month = e.expenseDate.substring(0, 7);
        monthMap[month] = (monthMap[month] || 0) + e.amount;
      }
      setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name: formatCategory(name), value })));
      setMonthlyData(Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({ month, amount })));
    } catch {}
  };

  const fetchInventoryItems = async () => {
    try {
      const res = await api.get<{ items: { id: string; title: string }[] }>('/inventory?limit=100', token || undefined);
      setInventoryItems(res.items);
    } catch {}
  };

  useEffect(() => { fetchExpenses(); fetchChartData(); }, [page, categoryFilter, vendorSearch, startDate, endDate, token]);
  useEffect(() => { if (showModal) fetchInventoryItems(); }, [showModal]);

  const openAddModal = () => {
    setEditingExpense(null);
    setFormCategory('Other');
    setFormVendor('');
    setFormAmount('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPaymentMethod('');
    setFormInventoryItemId('');
    setFormNotes('');
    setItemSearch('');
    setError('');
    setShowModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormCategory(expense.category);
    setFormVendor(expense.vendor || '');
    setFormAmount(expense.amount.toString());
    setFormDate(expense.expenseDate.split('T')[0]);
    setFormPaymentMethod(expense.paymentMethod || '');
    setFormInventoryItemId(expense.inventoryItemId || '');
    setFormNotes(expense.notes || '');
    setItemSearch(expense.inventoryItem?.title || '');
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formAmount || !formDate) { setError('Amount and date are required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        category: formCategory,
        vendor: formVendor || null,
        amount: parseFloat(formAmount),
        expenseDate: formDate,
        paymentMethod: formPaymentMethod || null,
        inventoryItemId: formInventoryItemId || null,
        notes: formNotes || null,
      };
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, payload, token || undefined);
      } else {
        await api.post('/expenses', payload, token || undefined);
      }
      setShowModal(false);
      fetchExpenses();
      fetchChartData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/expenses/${deleteId}`, token || undefined);
      setDeleteId(null);
      fetchExpenses();
      fetchChartData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (vendorSearch) params.set('vendor', vendorSearch);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const blob = await api.download(`/expenses/export?${params.toString()}`, token || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const filteredItems = inventoryItems.filter((i) =>
    !itemSearch || i.title.toLowerCase().includes(itemSearch.toLowerCase())
  ).slice(0, 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Expenses</h1>
          <p className="text-gray-500 mt-1">Track business expenses and costs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary text-sm">Export CSV</button>
          <button onClick={openAddModal} className="btn-primary text-sm">+ Add Expense</button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Expenses by Category</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {categoryData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Monthly Expense Trend</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
                <Bar dataKey="amount" fill="#ef4444" name="Expenses" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{formatCategory(c)}</option>
            ))}
          </select>
          <input type="text" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} className="input-field w-auto" placeholder="Search vendor..." />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-auto" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-auto" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading expenses...</div>
      ) : expenses.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No expenses recorded</p>
          <button onClick={openAddModal} className="btn-primary text-sm mt-2">Add Your First Expense</button>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Category</th>
                  <th className="table-header">Vendor</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Payment Method</th>
                  <th className="table-header">Linked Item</th>
                  <th className="table-header">Notes</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                        {formatCategory(exp.category)}
                      </span>
                    </td>
                    <td className="table-cell">{exp.vendor || '-'}</td>
                    <td className="table-cell font-medium">{formatCurrency(exp.amount)}</td>
                    <td className="table-cell text-xs">{new Date(exp.expenseDate).toLocaleDateString()}</td>
                    <td className="table-cell text-xs">{exp.paymentMethod || '-'}</td>
                    <td className="table-cell text-sm">
                      {exp.inventoryItem ? (
                        <span className="text-primary-600">{exp.inventoryItem.title}</span>
                      ) : '-'}
                    </td>
                    <td className="table-cell text-sm text-gray-500 max-w-[150px] truncate">{exp.notes || '-'}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(exp)} className="text-primary-600 hover:text-primary-700 text-xs">Edit</button>
                        <button onClick={() => setDeleteId(exp.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-50">Previous</button>
                <button onClick={() => setPage(Math.min(pagination.totalPages, page + 1))} disabled={page >= pagination.totalPages} className="btn-secondary text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h3>
            {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="input-field">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{formatCategory(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input value={formVendor} onChange={(e) => setFormVendor(e.target.value)} className="input-field" placeholder="e.g., USPS, eBay, Amazon..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <input type="number" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="input-field" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <input value={formPaymentMethod} onChange={(e) => setFormPaymentMethod(e.target.value)} className="input-field" placeholder="Credit Card, PayPal, Cash..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linked Inventory Item</label>
                <input value={itemSearch} onChange={(e) => { setItemSearch(e.target.value); setFormInventoryItemId(''); }} className="input-field" placeholder="Search items..." />
                {itemSearch && filteredItems.length > 0 && (
                  <div className="border border-gray-200 rounded-lg mt-1 max-h-32 overflow-y-auto">
                    {filteredItems.map((item) => (
                      <div key={item.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => { setFormInventoryItemId(item.id); setItemSearch(item.title); }}>
                        {item.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="input-field" rows={2} />
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editingExpense ? 'Update' : 'Add Expense'}</button>
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">Delete Expense?</h3>
            <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="btn-danger flex-1">Delete</button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
