import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

const formatPercent = (n: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(n) || 0) + '%';

export const CommissionRates: React.FC = () => {
  const [rates, setRates] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formRate, setFormRate] = useState('');
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ratesRes, compRes, cliRes] = await Promise.all([
        apiService.getCommissionRates(),
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      setRates(ratesRes.data || []);
      setCompanies(compRes.data || []);
      setClients(cliRes.data || []);
    } catch (err) {
      console.error('Errore caricamento tassi provvigione:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group rates by company
  const ratesByCompany = companies.map(company => {
    const companyRates = rates.filter(r => r.company_id === company.id);
    const defaultRate = companyRates.find(r => !r.country && !r.client_id);
    const overrides = companyRates.filter(r => r.country || r.client_id);
    return { company, defaultRate, overrides, allRates: companyRates };
  }).filter(g => g.allRates.length > 0 || true); // Show all companies

  const resetForm = () => {
    setFormCompanyId('');
    setFormCountry('');
    setFormClientId('');
    setFormRate('');
    setEditingRateId(null);
    setShowForm(false);
  };

  const handleEdit = (rate: any) => {
    setFormCompanyId(rate.company_id);
    setFormCountry(rate.country || '');
    setFormClientId(rate.client_id || '');
    setFormRate(String(rate.rate_percent));
    setEditingRateId(rate.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formCompanyId || !formRate) return;
    setSaving(true);
    try {
      await apiService.upsertCommissionRate({
        id: editingRateId || undefined,
        company_id: formCompanyId,
        country: formCountry || undefined,
        client_id: formClientId || undefined,
        rate_percent: parseFloat(formRate),
      });
      resetForm();
      await loadData();
    } catch (err) {
      console.error('Errore salvataggio tasso:', err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Eliminare questo tasso provvigionale?')) return;
    try {
      await apiService.deleteCommissionRate(id);
      await loadData();
    } catch (err) {
      console.error('Errore eliminazione tasso:', err);
    }
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-action-row">
        <span className="admin-count">{rates.length} tass{rates.length === 1 ? 'o' : 'i'} configurati</span>
        <button className="admin-btn admin-btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          + Nuovo Tasso
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label>Azienda *</label>
            <select value={formCompanyId} onChange={e => setFormCompanyId(e.target.value)}>
              <option value="">Seleziona...</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="admin-form-group">
            <label>Paese (opzionale)</label>
            <input type="text" value={formCountry} onChange={e => setFormCountry(e.target.value)} placeholder="es. IT, CN, DE" />
          </div>
          <div className="admin-form-group">
            <label>Cliente (opzionale)</label>
            <select value={formClientId} onChange={e => setFormClientId(e.target.value)}>
              <option value="">Nessuno (default)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="admin-form-group">
            <label>Tasso % *</label>
            <input type="number" step="0.1" min="0" max="100" value={formRate} onChange={e => setFormRate(e.target.value)} placeholder="es. 5.0" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
            <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvataggio...' : (editingRateId ? 'Aggiorna' : 'Salva')}
            </button>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetForm}>Annulla</button>
          </div>
        </div>
      )}

      {/* Company list */}
      {loading ? (
        <div className="admin-empty">Caricamento...</div>
      ) : (
        <div className="admin-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>AZIENDA</th>
                <th>PAESE</th>
                <th className="num">TASSO DEFAULT %</th>
                <th className="num">ECCEZIONI</th>
                <th>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {ratesByCompany.map(({ company, defaultRate, overrides }) => {
                const isExpanded = expandedCompanyId === company.id;
                return (
                  <React.Fragment key={company.id}>
                    <tr
                      className={`clickable-row ${isExpanded ? 'expanded-row' : ''}`}
                      onClick={() => setExpandedCompanyId(isExpanded ? null : company.id)}
                    >
                      <td><strong>{company.name}</strong></td>
                      <td>{company.country || '-'}</td>
                      <td className="num admin-amount">{defaultRate ? formatPercent(defaultRate.rate_percent) : '-'}</td>
                      <td className="num">{overrides.length}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          {defaultRate ? (
                            <>
                              <button className="admin-btn-icon" title="Modifica" onClick={() => handleEdit(defaultRate)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button className="admin-btn-icon danger" title="Elimina" onClick={() => handleDelete(defaultRate.id)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </>
                          ) : (
                            <button
                              className="admin-btn admin-btn-primary admin-btn-sm"
                              onClick={() => {
                                resetForm();
                                setFormCompanyId(company.id);
                                setShowForm(true);
                              }}
                            >
                              + Tasso
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && overrides.length > 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="admin-sub-table-wrap">
                            <table className="admin-sub-table">
                              <thead>
                                <tr>
                                  <th>TIPO</th>
                                  <th>VALORE</th>
                                  <th className="num">TASSO %</th>
                                  <th>AZIONI</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overrides.map(rate => (
                                  <tr key={rate.id}>
                                    <td>{rate.client_id ? 'Cliente' : 'Paese'}</td>
                                    <td>{rate.client_id ? (rate.client?.name || rate.client_id) : rate.country}</td>
                                    <td className="num">{formatPercent(rate.rate_percent)}</td>
                                    <td>
                                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                                        <button className="admin-btn-icon" title="Modifica" onClick={() => handleEdit(rate)}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button className="admin-btn-icon danger" title="Elimina" onClick={() => handleDelete(rate.id)}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && overrides.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="admin-sub-table-wrap">
                            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                              Nessuna eccezione configurata per questa azienda.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CommissionRates;
