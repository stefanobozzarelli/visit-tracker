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
      setError('Errore nel caricamento dei clienti');
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
        <h1>Gestione Clienti</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Aggiungi Cliente
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-card">
          <h3>{editingId ? 'Modifica Cliente' : 'Aggiungi Cliente'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome Cliente *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Nazione *</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Ruolo Cliente</label>
              <select
                value={(formData as any).role || 'cliente'}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="cliente">Cliente</option>
                <option value="developer">Developer</option>
                <option value="architetto-designer">Architetto/Designer</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Salva' : 'Crea'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p>Caricamento...</p>
      ) : clients.length === 0 ? (
        <p>Nessun cliente</p>
      ) : (
        <>
          <div className="search-container">
            <input
              type="text"
              placeholder="Ricerca per nome o contatti..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Nazione</th>
                  <th>Ruolo</th>
                  <th>Contatti</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {getSortedAndFilteredClients().map((client) => {
                  const roleLabels: { [key: string]: string } = {
                    'cliente': 'Cliente',
                    'developer': 'Developer',
                    'architetto-designer': 'Architetto/Designer',
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
                          Dettagli
                        </button>
                        <button onClick={() => handleEdit(client)} className="btn-warning">
                          Modifica
                        </button>
                        <button
                          onClick={() => handleDelete(client)}
                          className="btn-danger"
                        >
                          Elimina
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
            <h2>Conferma Cancellazione Cliente</h2>
            <div className="modal-body">
              <p className="warning-message">
                ⚠️ <strong>Attenzione:</strong> Questa azione cancellerà il cliente <strong>{clientToDelete.name}</strong> e <strong>TUTTE le visite associate</strong>. Questa operazione non può essere annullata.
              </p>
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={deleteConfirmCheckbox}
                    onChange={(e) => setDeleteConfirmCheckbox(e.target.checked)}
                  />
                  Confermo di voler cancellare il cliente "{clientToDelete.name}"
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCancelDelete}
                className="btn-secondary"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!deleteConfirmCheckbox}
                className="btn-danger"
              >
                Elimina Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
