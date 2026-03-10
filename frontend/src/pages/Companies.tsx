import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { Company } from '../types';
import '../styles/CrudPages.css';

export const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '', industry: '' });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getCompanies();
      if (response.success && response.data) {
        setCompanies(response.data);
      }
    } catch (err) {
      setError('Errore nel caricamento delle aziende');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateCompany(editingId, formData);
      } else {
        await apiService.createCompany(formData.name, formData.country, formData.industry);
      }
      setFormData({ name: '', country: '', industry: '' });
      setEditingId(null);
      setShowForm(false);
      loadCompanies();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEdit = (company: Company) => {
    setFormData({ name: company.name, country: company.country, industry: company.industry || '' });
    setEditingId(company.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro?')) return;
    try {
      await apiService.deleteCompany(id);
      loadCompanies();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', country: '', industry: '' });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Gestione Aziende</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Aggiungi Azienda
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-card">
          <h3>{editingId ? 'Modifica Azienda' : 'Aggiungi Azienda'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome Azienda *</label>
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
              <label>Settore Industria</label>
              <input
                type="text"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              />
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
      ) : companies.length === 0 ? (
        <p>Nessuna azienda</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nazione</th>
                <th>Settore</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.country}</td>
                  <td>{company.industry || '-'}</td>
                  <td className="actions">
                    <button onClick={() => handleEdit(company)} className="btn-warning">
                      Modifica
                    </button>
                    <button
                      onClick={() => handleDelete(company.id)}
                      className="btn-danger"
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
