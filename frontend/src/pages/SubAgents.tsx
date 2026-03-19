import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { SubAgentDetail } from './SubAgentDetail';

const formatPercent = (n: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(n) || 0) + '%';

export const SubAgents: React.FC = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRates, setExpandedRates] = useState<any[]>([]);
  const [detailAgent, setDetailAgent] = useState<{ id: string; name: string } | null>(null);

  // Agent form
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [agentUserId, setAgentUserId] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);

  // Rate form
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateCompanyId, setRateCompanyId] = useState('');
  const [rateCountry, setRateCountry] = useState('');
  const [rateClientId, setRateClientId] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [rateCalcOn, setRateCalcOn] = useState<'gross' | 'residual'>('gross');
  const [ratePriority, setRatePriority] = useState('1');
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, compRes, cliRes, usersRes] = await Promise.all([
        apiService.getSubAgents(),
        apiService.getCompanies(),
        apiService.getClients(),
        apiService.getUsers(),
      ]);
      setAgents(agentsRes.data || []);
      setCompanies(compRes.data || []);
      setClients(cliRes.data || []);
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error('Errore caricamento subagenti:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedRates([]);
      return;
    }
    setExpandedId(id);
    try {
      const res = await apiService.getSubAgentRates(id);
      setExpandedRates(res.data || []);
    } catch (err) {
      console.error('Errore caricamento tassi subagente:', err);
      setExpandedRates([]);
    }
  };

  // Agent CRUD
  const resetAgentForm = () => {
    setAgentName(''); setAgentEmail(''); setAgentPhone('');
    setAgentNotes(''); setAgentUserId('');
    setEditingAgentId(null); setShowAgentForm(false);
  };

  const handleEditAgent = (agent: any) => {
    setAgentName(agent.name || '');
    setAgentEmail(agent.email || '');
    setAgentPhone(agent.phone || '');
    setAgentNotes(agent.notes || '');
    setAgentUserId(agent.user_id || '');
    setEditingAgentId(agent.id);
    setShowAgentForm(true);
  };

  const handleSaveAgent = async () => {
    if (!agentName.trim()) return;
    setSavingAgent(true);
    try {
      const data = {
        name: agentName.trim(),
        email: agentEmail.trim() || undefined,
        phone: agentPhone.trim() || undefined,
        notes: agentNotes.trim() || undefined,
        user_id: agentUserId || undefined,
      };
      if (editingAgentId) {
        await apiService.updateSubAgent(editingAgentId, data);
      } else {
        await apiService.createSubAgent(data);
      }
      resetAgentForm();
      await loadData();
    } catch (err) {
      console.error('Errore salvataggio subagente:', err);
    }
    setSavingAgent(false);
  };

  const handleDeleteAgent = async (id: string) => {
    if (!window.confirm('Eliminare questo subagente e tutti i suoi tassi?')) return;
    try {
      await apiService.deleteSubAgent(id);
      if (expandedId === id) { setExpandedId(null); setExpandedRates([]); }
      await loadData();
    } catch (err) {
      console.error('Errore eliminazione subagente:', err);
    }
  };

  // Rate CRUD
  const resetRateForm = () => {
    setRateCompanyId(''); setRateCountry(''); setRateClientId('');
    setRatePercent(''); setRateCalcOn('gross'); setRatePriority('1');
    setEditingRateId(null); setShowRateForm(false);
  };

  const handleEditRate = (rate: any) => {
    setRateCompanyId(rate.company_id || '');
    setRateCountry(rate.country || '');
    setRateClientId(rate.client_id || '');
    setRatePercent(String(rate.rate_percent));
    setRateCalcOn(rate.calc_on || 'gross');
    setRatePriority(String(rate.priority || 1));
    setEditingRateId(rate.id);
    setShowRateForm(true);
  };

  const handleSaveRate = async () => {
    if (!expandedId || !rateCompanyId || !ratePercent) return;
    setSavingRate(true);
    try {
      await apiService.upsertSubAgentRate(expandedId, {
        id: editingRateId || undefined,
        company_id: rateCompanyId,
        country: rateCountry || undefined,
        client_id: rateClientId || undefined,
        rate_percent: parseFloat(ratePercent),
        calc_on: rateCalcOn,
        priority: parseInt(ratePriority) || 1,
      });
      resetRateForm();
      // Refresh rates
      const res = await apiService.getSubAgentRates(expandedId);
      setExpandedRates(res.data || []);
    } catch (err) {
      console.error('Errore salvataggio tasso subagente:', err);
    }
    setSavingRate(false);
  };

  const handleDeleteRate = async (rateId: string) => {
    if (!window.confirm('Eliminare questo tasso?')) return;
    try {
      await apiService.deleteSubAgentRate(rateId);
      if (expandedId) {
        const res = await apiService.getSubAgentRates(expandedId);
        setExpandedRates(res.data || []);
      }
    } catch (err) {
      console.error('Errore eliminazione tasso:', err);
    }
  };

  // Show detail view
  if (detailAgent) {
    return (
      <div className="admin-tab-content">
        <SubAgentDetail
          subAgentId={detailAgent.id}
          subAgentName={detailAgent.name}
          onBack={() => setDetailAgent(null)}
        />
      </div>
    );
  }

  return (
    <div className="admin-tab-content">
      <div className="admin-action-row">
        <span className="admin-count">{agents.length} subagent{agents.length === 1 ? 'e' : 'i'}</span>
        <button className="admin-btn admin-btn-primary" onClick={() => { resetAgentForm(); setShowAgentForm(true); }}>
          + Nuovo Subagente
        </button>
      </div>

      {/* Agent Form */}
      {showAgentForm && (
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label>Nome *</label>
            <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Nome subagente" />
          </div>
          <div className="admin-form-group">
            <label>Email</label>
            <input type="email" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} placeholder="email@esempio.com" />
          </div>
          <div className="admin-form-group">
            <label>Telefono</label>
            <input type="text" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="+39..." />
          </div>
          <div className="admin-form-group">
            <label>Utente collegato</label>
            <select value={agentUserId} onChange={e => setAgentUserId(e.target.value)}>
              <option value="">Esterno (non collegato)</option>
              {users.filter(u => u.role === 'sales_rep').map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
          <div className="admin-form-group">
            <label>Note</label>
            <textarea value={agentNotes} onChange={e => setAgentNotes(e.target.value)} placeholder="Note..." />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
            <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={handleSaveAgent} disabled={savingAgent}>
              {savingAgent ? 'Salvataggio...' : (editingAgentId ? 'Aggiorna' : 'Salva')}
            </button>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetAgentForm}>Annulla</button>
          </div>
        </div>
      )}

      {/* Agents Table */}
      {loading ? (
        <div className="admin-empty">Caricamento...</div>
      ) : agents.length === 0 ? (
        <div className="admin-empty">
          <p>Nessun subagente configurato</p>
        </div>
      ) : (
        <div className="admin-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NOME</th>
                <th>EMAIL</th>
                <th>TELEFONO</th>
                <th>UTENTE</th>
                <th>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const isExpanded = expandedId === agent.id;
                return (
                  <React.Fragment key={agent.id}>
                    <tr
                      className={`clickable-row ${isExpanded ? 'expanded-row' : ''}`}
                      onClick={() => handleExpand(agent.id)}
                    >
                      <td><strong>{agent.name}</strong></td>
                      <td>{agent.email || '-'}</td>
                      <td>{agent.phone || '-'}</td>
                      <td>{agent.user?.name || '-'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8125rem' }}
                            title="Scheda subagente" onClick={() => setDetailAgent({ id: agent.id, name: agent.name })}>
                            Scheda
                          </button>
                          <button className="admin-btn-icon" title="Modifica" onClick={() => handleEditAgent(agent)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="admin-btn-icon danger" title="Elimina" onClick={() => handleDeleteAgent(agent.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="admin-sub-table-wrap">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                                Tassi provvigione di {agent.name}
                              </strong>
                              <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => { resetRateForm(); setShowRateForm(true); }}>
                                + Tasso
                              </button>
                            </div>

                            {/* Rate form */}
                            {showRateForm && (
                              <div className="admin-form-row" style={{ marginBottom: '0.75rem' }}>
                                <div className="admin-form-group">
                                  <label>Azienda *</label>
                                  <select value={rateCompanyId} onChange={e => setRateCompanyId(e.target.value)}>
                                    <option value="">Seleziona...</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div className="admin-form-group">
                                  <label>Paese</label>
                                  <select value={rateCountry} onChange={e => setRateCountry(e.target.value)}>
                                    <option value="">Tutti</option>
                                    {[...new Set(clients.map((c: any) => c.country).filter(Boolean))].sort().map(country => (
                                      <option key={country} value={country}>{country}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="admin-form-group">
                                  <label>Cliente</label>
                                  <select value={rateClientId} onChange={e => setRateClientId(e.target.value)}>
                                    <option value="">Nessuno</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div className="admin-form-group">
                                  <label>Tasso % *</label>
                                  <input type="number" step="0.1" min="0" max="100" value={ratePercent} onChange={e => setRatePercent(e.target.value)} />
                                </div>
                                <div className="admin-form-group">
                                  <label>Calcolo su</label>
                                  <select value={rateCalcOn} onChange={e => setRateCalcOn(e.target.value as 'gross' | 'residual')}>
                                    <option value="gross">Lordo</option>
                                    <option value="residual">Residuo</option>
                                  </select>
                                </div>
                                <div className="admin-form-group">
                                  <label>Priorita</label>
                                  <input type="number" min="1" max="99" value={ratePriority} onChange={e => setRatePriority(e.target.value)} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
                                  <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={handleSaveRate} disabled={savingRate}>
                                    {savingRate ? 'Salvataggio...' : (editingRateId ? 'Aggiorna' : 'Salva')}
                                  </button>
                                  <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetRateForm}>Annulla</button>
                                </div>
                              </div>
                            )}

                            {expandedRates.length > 0 ? (
                              <table className="admin-sub-table">
                                <thead>
                                  <tr>
                                    <th>AZIENDA</th>
                                    <th>PAESE</th>
                                    <th>CLIENTE</th>
                                    <th className="num">TASSO %</th>
                                    <th>CALCOLO SU</th>
                                    <th className="num">PRIORITA</th>
                                    <th>AZIONI</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedRates.map(rate => (
                                    <tr key={rate.id}>
                                      <td>{rate.company?.name || rate.company_id}</td>
                                      <td>{rate.country || '-'}</td>
                                      <td>{rate.client?.name || '-'}</td>
                                      <td className="num">{formatPercent(rate.rate_percent)}</td>
                                      <td>{rate.calc_on === 'gross' ? 'Lordo' : 'Residuo'}</td>
                                      <td className="num">{rate.priority}</td>
                                      <td>
                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                          <button className="admin-btn-icon" title="Modifica" onClick={() => handleEditRate(rate)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                          </button>
                                          <button className="admin-btn-icon danger" title="Elimina" onClick={() => handleDeleteRate(rate.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                                Nessun tasso configurato per questo subagente.
                              </p>
                            )}
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

export default SubAgents;
