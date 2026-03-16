import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Client } from '../types';
import '../styles/CrudPages.css';

export const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '', notes: '', role: 'cliente' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleteConfirmCheckbox, setDeleteConfirmCheckbox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getClients();
      if (response.success && response.data) {
        setClients(response.data);
      }
    } catch (err) {
      setError('Error loading clients');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateClient(editingId, formData);
      } else {
        await apiService.createClient(formData.name, formData.country, formData.notes, (formData as any).role);
      }
      setFormData({ name: '', country: '', notes: '', role: 'cliente' });
      setEditingId(null);
      setShowForm(false);
      loadClients();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEdit = (client: Client) => {
    setFormData({ name: client.name, country: client.country, notes: client.notes || '', role: (client as any).role || 'cliente' });
    setEditingId(client.id);
    setShowForm(true);
  };

  const handleDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteConfirmCheckbox(false);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!clientToDelete || !deleteConfirmCheckbox) return;
    try {
      await apiService.deleteClient(clientToDelete.id);
      setShowDeleteModal(false);
      setClientToDelete(null);
      setDeleteConfirmCheckbox(false);
      loadClients();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setClientToDelete(null);
    setDeleteConfirmCheckbox(false);
  };

  const handleCancel = () => {
    setFormData({ name: '', country: '', notes: '', role: 'cliente' });
    setEditingId(null);
    setShowForm(false);
  };

  const getSortedAndFilteredClients = () => {
    let filtered = [...clients];

    // Filtra per ricerca (nome o contatti)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (client) =>
          client.name.toLowerCase().includes(query) ||
          (client.contacts?.some((contact) => contact.name.toLowerCase().includes(query)))
      );
    }

    // Ordina per ruolo, poi alfabeticamente per nome
    const roleOrder: { [key: string]: number } = {
      'cliente': 0,
      'developer': 1,
      'architetto-designer': 2,
    };

    filtered.sort((a, b) => {
      const roleA = roleOrder[(a as any).role || 'cliente'] ?? 999;
      const roleB = roleOrder[(b as any).role || 'cliente'] ?? 999;

      if (roleA !== roleB) {
        return roleA - roleB;
      }

      return a.name.localeCompare(b.name);
    });

    return filtered;
  };

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Clients Management</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add Client
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-card">
          <h3>{editingId ? 'Edit Client' : 'Add Client'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Client Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Country *</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Client Role</label>
              <select
                value={(formData as any).role || 'cliente'}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="cliente">Client</option>
                <option value="developer">Developer</option>
                <option value="architetto-designer">Architect/Designer</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Save' : 'Create'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p>Loading...</p>
      ) : clients.length === 0 ? (
        <p>No clients</p>
      ) : (
        <>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search by name or contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Role</th>
                  <th>Contacts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getSortedAndFilteredClients().map((client) => {
                  const roleLabels: { [key: string]: string } = {
                    'cliente': 'Client',
                    'developer': 'Developer',
                    'architetto-designer': 'Architect/Designer',
                  };
                  const roleLabel = roleLabels[(client as any).role || 'cliente'] || 'Cliente';

                  return (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>{client.country}</td>
                      <td>{roleLabel}</td>
                      <td>{client.contacts?.length || 0}</td>
                      <td className="actions">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="btn-info"
                        >
                          Details
                        </button>
                        <button onClick={() => handleEdit(client)} className="btn-warning">
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(client)}
                          className="btn-danger"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showDeleteModal && clientToDelete && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Delete Client</h2>
            <div className="modal-body">
              <p className="warning-message">
                ⚠️ <strong>Warning:</strong> This action will delete the client <strong>{clientToDelete.name}</strong> and <strong>ALL associated visits</strong>. This operation cannot be undone.
              </p>
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={deleteConfirmCheckbox}
                    onChange={(e) => setDeleteConfirmCheckbox(e.target.checked)}
                  />
                  I confirm I want to delete the client "{clientToDelete.name}"
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCancelDelete}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!deleteConfirmCheckbox}
                className="btn-danger"
              >
                Delete Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
