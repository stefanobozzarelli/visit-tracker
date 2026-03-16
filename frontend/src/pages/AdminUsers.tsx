import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import '../styles/AdminUsers.css';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id?: string;
  created_at: string;
}

interface FormData {
  name: string;
  email: string;
  password: string;
  role: string;
  company_id?: string;
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'email' | 'name' | 'role'>('email');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    role: 'sales_rep',
    company_id: '',
  });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Clear alerts after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUsers();
      if (response.success) {
        setUsers(response.data || []);
      } else {
        setError(response.error || 'Failed to load users');
      }
    } catch (err) {
      setError('Error loading users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.email || !formData.password) {
      setError('Name, email, and password are required');
      return;
    }

    try {
      const response = await apiService.createUser(
        formData.email,
        formData.name,
        formData.password,
        formData.role,
        formData.company_id || undefined
      );

      if (response.success) {
        setSuccess('User created successfully');
        setFormData({
          name: '',
          email: '',
          password: '',
          role: 'sales_rep',
          company_id: '',
        });
        await loadUsers();
      } else {
        setError(response.error || 'Failed to create user');
      }
    } catch (err) {
      setError((err as Error).message || 'Error creating user');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    setError('');
    setSuccess('');

    if (!formData.name || !formData.email) {
      setError('Name and email are required');
      return;
    }

    try {
      // Update user data
      const response = await apiService.updateUser(editingUserId, {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        company_id: formData.company_id || undefined,
      });

      if (!response.success) {
        setError(response.error || 'Failed to update user');
        return;
      }

      // If password is provided, update it separately
      if (formData.password) {
        const passwordResponse = await apiService.changeUserPassword(editingUserId, formData.password);
        if (!passwordResponse.success) {
          setError(passwordResponse.error || 'Failed to update password');
          return;
        }
      }

      setSuccess('User updated successfully');
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'sales_rep',
        company_id: '',
      });
      setEditingUserId(null);
      await loadUsers();
    } catch (err) {
      setError((err as Error).message || 'Error updating user');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      company_id: user.company_id || '',
    });
    setError('');
    setSuccess('');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setError('');
    setSuccess('');

    try {
      const response = await apiService.deleteUser(deleteConfirm.userId);
      if (response.success) {
        setSuccess('User deleted successfully');
        setDeleteConfirm(null);
        await loadUsers();
      } else {
        setError(response.error || 'Failed to delete user');
      }
    } catch (err) {
      setError((err as Error).message || 'Error deleting user');
    }
  };

  // Filter and sort users
  const filteredUsers = users
    .filter(user =>
      user.email.toLowerCase().includes(searchText.toLowerCase()) ||
      user.name.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });

  return (
    <div className="admin-users">
      <div className="header">
        <h1>Users Management</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="users-container">
        {/* Form Section */}
        <div className="form-section">
          <h2>{editingUserId ? 'Edit User' : 'Create New User'}</h2>
          <form onSubmit={editingUserId ? handleUpdate : handleCreate}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                placeholder="user@example.com"
              />
            </div>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="Full name"
              />
            </div>

            {!editingUserId ? (
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleFormChange}
                  placeholder="Min 8 characters"
                />
              </div>
            ) : (
              <div className="form-group">
                <label>New Password (optional)</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleFormChange}
                  placeholder="Leave empty to keep current password"
                />
              </div>
            )}

            <div className="form-group">
              <label>Role</label>
              <select name="role" value={formData.role} onChange={handleFormChange}>
                <option value="sales_rep">Sales Rep</option>
                <option value="backoffice">Backoffice</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-group">
              <label>Company ID (optional)</label>
              <input
                type="text"
                name="company_id"
                value={formData.company_id}
                onChange={handleFormChange}
                placeholder="Company ID"
              />
            </div>

            <button type="submit" className="btn btn-primary">
              {editingUserId ? 'Save Changes' : 'Create User'}
            </button>
            {editingUserId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingUserId(null);
                  setFormData({
                    name: '',
                    email: '',
                    password: '',
                    role: 'sales_rep',
                    company_id: '',
                  });
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>

        {/* Table Section */}
        <div className="table-section">
          <h2>Users List</h2>

          <div className="table-controls">
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="search-input"
            />
            <div className="sort-controls">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="email">Sort by Email</option>
                <option value="name">Sort by Name</option>
                <option value="role">Sort by Role</option>
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">No users found</div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.name}</td>
                    <td>{user.role}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="actions">
                      <button
                        className="btn btn-warning btn-small"
                        onClick={() => handleEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => setDeleteConfirm({ userId: user.id, email: user.email })}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Confirm Deletion</h2>
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.email}</strong>? This action will also delete all associated visits, permissions, and attachments.
            </p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete User
              </button>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
