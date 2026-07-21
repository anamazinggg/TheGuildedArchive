import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { productConfig } from '../config/product';

interface ListingTemplate {
  id: string;
  name: string;
  category: string;
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  tagsTemplate: string | null;
  shippingProfile: string | null;
  returnPolicy: string | null;
  createdAt: string;
  updatedAt: string;
}

const categories = [...productConfig.categories];

const defaultForm = {
  name: '',
  category: 'Ring',
  titleTemplate: '',
  descriptionTemplate: '',
  tagsTemplate: '',
  shippingProfile: '',
  returnPolicy: '',
};

export default function ListingTemplates() {
  const { token } = useAuth();

  const [templates, setTemplates] = useState<ListingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await api.get<{ templates: ListingTemplate[] }>(
        `/listings/templates?${params.toString()}`,
        token || undefined
      );
      setTemplates(res.templates);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [categoryFilter]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const openCreate = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const openEdit = (tpl: ListingTemplate) => {
    setForm({
      name: tpl.name,
      category: tpl.category,
      titleTemplate: tpl.titleTemplate || '',
      descriptionTemplate: tpl.descriptionTemplate || '',
      tagsTemplate: tpl.tagsTemplate || '',
      shippingProfile: tpl.shippingProfile || '',
      returnPolicy: tpl.returnPolicy || '',
    });
    setEditingId(tpl.id);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category: form.category,
        titleTemplate: form.titleTemplate || null,
        descriptionTemplate: form.descriptionTemplate || null,
        tagsTemplate: form.tagsTemplate || null,
        shippingProfile: form.shippingProfile || null,
        returnPolicy: form.returnPolicy || null,
      };

      if (editingId) {
        await api.put(`/listings/templates/${editingId}`, payload, token || undefined);
      } else {
        await api.post('/listings/templates', payload, token || undefined);
      }
      setShowForm(false);
      setEditingId(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/listings/templates/${id}`, token || undefined);
      await fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const inputClass = "input-field";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Listing Templates</h1>
          <p className="text-gray-500 mt-1">Pre-built listing templates with placeholder variables</p>
        </div>
        <div className="flex gap-2">
          <Link to="/listings" className="btn-secondary text-sm">Back to Listings</Link>
          <button onClick={openCreate} className="btn-primary text-sm">+ New Template</button>
        </div>
      </div>

      {/* Template Form (Slide-down) */}
      {showForm && (
        <div className="card mb-6 border-2 border-primary-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{editingId ? 'Edit Template' : 'New Template'}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Template Name *</label>
                <input name="name" value={form.name} onChange={handleChange} className={inputClass} required placeholder="e.g. Victorian Ring Template" />
              </div>
              <div>
                <label className={labelClass}>Category *</label>
                <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Title Template
                <span className="text-xs text-gray-400 ml-2">
                  Use {'{{'} metal {'}}'}, {'{{'} type {'}}'}, {'{{'} era {'}}'}, {'{{'} category {'}}'}, {'{{'} gemstone {'}}'}, {'{{'} brand {'}}'}
                </span>
              </label>
              <input name="titleTemplate" value={form.titleTemplate} onChange={handleChange} className={inputClass} placeholder="e.g. Victorian {{metal}} {{type}} — {{era}}" />
            </div>
            <div>
              <label className={labelClass}>Description Template</label>
              <textarea name="descriptionTemplate" value={form.descriptionTemplate} onChange={handleChange} className={inputClass} rows={3} placeholder="Template text with optional {{variable}} placeholders..." />
            </div>
            <div>
              <label className={labelClass}>Tags Template (comma-separated)</label>
              <input name="tagsTemplate" value={form.tagsTemplate} onChange={handleChange} className={inputClass} placeholder="e.g. vintage, antique, {{metal}}, {{category}}" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Shipping Profile</label>
                <input name="shippingProfile" value={form.shippingProfile} onChange={handleChange} className={inputClass} placeholder="e.g. Free Shipping" />
              </div>
              <div>
                <label className={labelClass}>Return Policy</label>
                <input name="returnPolicy" value={form.returnPolicy} onChange={handleChange} className={inputClass} placeholder="e.g. 14-day returns" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Category filter */}
      <div className="card mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filter by category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field w-44"
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Templates Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No templates found.{' '}
            <button onClick={openCreate} className="text-primary-600 hover:text-primary-700">Create your first template</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Title Template</th>
                  <th className="table-header">Shipping</th>
                  <th className="table-header">Return Policy</th>
                  <th className="table-header">Last Updated</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {templates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-900">{tpl.name}</td>
                    <td className="table-cell">{tpl.category}</td>
                    <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">
                      {tpl.titleTemplate || '-'}
                    </td>
                    <td className="table-cell text-xs">{tpl.shippingProfile || '-'}</td>
                    <td className="table-cell text-xs">{tpl.returnPolicy || '-'}</td>
                    <td className="table-cell text-xs text-gray-500">
                      {new Date(tpl.updatedAt || tpl.createdAt).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(tpl)}
                          className="text-xs text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(tpl.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
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
