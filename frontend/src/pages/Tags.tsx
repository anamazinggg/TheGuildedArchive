import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  _count?: { inventoryItems: number };
}

const presetColors = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b',
];

export default function TagsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(presetColors[0]);
  const [error, setError] = useState('');

  const fetchTags = async () => {
    try {
      const res = await api.get<{ tags: Tag[] }>('/tags', token || undefined);
      setTags(res.tags);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/tags', { name: newName, color: newColor }, token || undefined);
      setNewName('');
      setNewColor(presetColors[0]);
      setShowForm(false);
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tag? It will be removed from all items.')) return;
    try {
      await api.delete(`/tags/${id}`, token || undefined);
      fetchTags();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  const handleTagClick = (tagId: string) => {
    navigate(`/inventory?tagId=${tagId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900">Tags</h1>
          <p className="text-gray-500 mt-1">{tags.length} tags created · click a tag to filter inventory</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          + New Tag
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <h2 className="font-semibold text-gray-900">Create Tag</h2>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="input-field" placeholder="e.g., Victorian, Gold, Signed" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <div className="flex gap-1 flex-wrap max-w-xs">
                  {presetColors.map((color) => (
                    <button key={color} type="button" onClick={() => setNewColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${newColor === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : tags.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No tags yet. Create your first tag to categorize inventory items.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="card flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleTagClick(tag.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color || '#94a3b8' }} />
                <div>
                  <p className="font-medium text-gray-900">{tag.name}</p>
                  <p className="text-xs text-gray-400">
                    {tag._count?.inventoryItems || 0} item{(tag._count?.inventoryItems || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(tag.id); }}
                className="text-red-400 hover:text-red-600 text-sm"
                title="Delete tag"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
