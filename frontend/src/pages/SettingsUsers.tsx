import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import { productConfig } from '../config/product';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

const validRoles = ['Owner', 'Manager', 'ListingAssistant', 'FulfillmentAssistant', 'ReadOnly'];

export default function SettingsUsers() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', password: '', name: '', role: 'ReadOnly' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<{ user: User; role: string } | null>(null);

  useEffect(() => {
    document.title = `Staff Users — ${productConfig.productName}`;
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get<{ users: User[] }>('/users', token || undefined);
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [token]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/users', addForm, token || undefined);
      setSuccess(`User ${addForm.email} created successfully`);
      setAddForm({ email: '', password: '', name: '', role: 'ReadOnly' });
      setShowAddForm(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`, token || undefined);
      setSuccess(`User ${deleteTarget.email} removed`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/users/${userId}`, { role: newRole }, token || undefined);
      setSuccess('Role updated');
      setEditRole(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  if (currentUser?.role !== 'Owner') {
    return (
      <div>
        <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white mb-4">Staff Users</h1>
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Only the Owner can manage staff accounts.</p>
        </div>
      </div>
    );
  }

  const roleColor = (role: string) => {
    const colors: Record<string, string> = {
      Owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      Manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      ListingAssistant: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      FulfillmentAssistant: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      ReadOnly: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white">Staff Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage staff accounts and permissions</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
          + Add User
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm mb-4">{success}</div>}

      {showAddForm && (
        <div className="card mb-6">
          <form onSubmit={handleAddUser} className="space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Add Staff User</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                <input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="input-field" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} className="input-field">
                  {validRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating...' : 'Create User'}</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Email</th>
                <th className="table-header">Role</th>
                <th className="table-header">Created</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="table-cell font-medium">{u.name}</td>
                  <td className="table-cell">{u.email}</td>
                  <td className="table-cell">
                    {editRole?.user.id === u.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editRole.role}
                          onChange={(e) => setEditRole({ ...editRole, role: e.target.value })}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-700 dark:text-white"
                        >
                          {validRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => handleRoleChange(u.id, editRole.role)} className="text-xs text-green-600 dark:text-green-400 font-medium">Save</button>
                        <button onClick={() => setEditRole(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${roleColor(u.role)}`}>
                          {u.role}
                        </span>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => setEditRole({ user: u, role: u.role })} className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-500 dark:text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="table-cell">
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove User"
        message={`Are you sure you want to remove ${deleteTarget?.name} (${deleteTarget?.email})? This action cannot be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
