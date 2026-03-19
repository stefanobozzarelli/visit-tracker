import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

const formatDate = (date?: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('it-IT');
};

const formatPercent = (n: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(n) || 0) + '%';

const STATUSES = [
  { value: 'aggiunta', label: 'Aggiunta' },
  { value: 'controllata', label: 'Controllata' },
  { value: 'fatturata', label: 'Fatturata' },
  { value: 'pagata', label: 'Pagata' },
  { value: 'pagati_subagenti', label: 'Pagati Subagenti' },
];

function statusLabel(s: string): string {
  return STATUSES.find(st => st.value === s)?.label || s;
}

export const CommissionInvoices: React.FC = () => {
  const [commissions, setCommissions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any | null>(null);

  // Filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Override modal
  const [showOverride, setShowOverride] = useState(false);
  const [overrideInvoiceId, setOverrideInvoiceId] = useState('');
  const [overridePercent, setOverridePercent] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  const [recalculating, setRecalculating] = useState(false);
  const [showPaidSub, setShowPaidSub] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [commRes, compRes, cliRes] = await Promise.all([
        apiService.getInvoiceCommissions({
          company_id: filterCompany || undefined,
          client_id: filterClient || undefined,
          status: filterStatus || undefined,
          start_date: filterStartDate || undefined,
          end_date: filterEndDate || undefined,
        }),
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      setCommissions(commRes.data || []);
      setCompanies(compRes.data || []);
      setClients(cliRes.data || []);
    } catch (err) {
      console.error('Errore caricamento provvigioni fatture:', err);
    }
    setLoading(false);
  }, [filterCompany, filterClient, filterStatus, filterStartDate, filterEndDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExpand = async (invoiceId: string) => {
    if (expandedId === invoiceId) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(invoiceId);
    try {
      const res = await apiService.getInvoiceCommission(invoiceId);
      setExpandedDetail(res.data);
    } catch (err) {
      console.error('Errore caricamento dettaglio provvigione:', err);
      setExpandedDetail(null);
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    try {
      await apiService.updateCommissionStatus(invoiceId, newStatus);
      await loadData();
    } catch (err) {
      console.error('Errore aggiornamento stato:', err);
    }
  };

  const openOverrideModal = (comm: any) => {
    setOverrideInvoiceId(comm.invoice_id);
    setOverridePercent(String(comm.commission_rate_percent || ''));
    setOverrideAmount(comm.manual_amount != null ? String(comm.manual_amount) : '');
    setOverrideNotes(comm.notes || '');
    setShowOverride(true);
  };

  const handleOverrideSave = async () => {
    if (!overrideInvoiceId) return;
    setSavingOverride(true);
    try {
      await apiService.overrideCommission(overrideInvoiceId, {
        rate_percent: overridePercent ? parseFloat(overridePercent) : undefined,
        manual_amount: overrideAmount ? parseFloat(overrideAmount) : undefined,
        notes: overrideNotes || undefined,
      });
      setShowOverride(false);
      await loadData();
    } catch (err) {
      console.error('Errore override provvigione:', err);
    }
    setSavingOverride(false);
  };

  const handleRecalculate = async (invoiceId: string) => {
    try {
      await apiService.recalculateCommission(invoiceId);
      await loadData();
      if (expandedId === invoiceId) {
        const res = await apiService.getInvoiceCommission(invoiceId);
        setExpandedDetail(res.data);
      }
    } catch (err) {
      console.error('Errore ricalcolo:', err);
    }
  };

  const handleRecalculateAll = async () => {
    if (!window.confirm('Ricalcolare le provvigioni per tutte le fatture?')) return;
    setRecalculating(true);
    try {
      await apiService.recalculateAllCommissions();
      await loadData();
    } catch (err) {
      console.error('Errore ricalcolo globale:', err);
    }
    setRecalculating(false);
  };

  const filteredCommissions = showPaidSub
    ? commissions
    : commissions.filter(c => c.commission_status !== 'pagati_subagenti');

  return (
    <div className="admin-tab-content">
      {/* Filters */}
      <div className="admin-filters">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">Tutte le Aziende</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Tutti i Clienti</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tutti gli Stati</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem', color: '#666258' }}>
          <input type="checkbox" checked={showPaidSub} onChange={e => setShowPaidSub(e.target.checked)} />
          Mostra pagati subagenti
        </label>
      </div>

      <div className="admin-action-row">
        <span className="admin-count">{filteredCommissions.length} provvigion{filteredCommissions.length === 1 ? 'e' : 'i'}{!showPaidSub && commissions.length !== filteredCommissions.length ? ` (${commissions.length - filteredCommissions.length} nascosti)` : ''}</span>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={handleRecalculateAll}
          disabled={recalculating}
        >
          {recalculating ? 'Ricalcolo in corso...' : 'Ricalcola Tutte'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="admin-empty">Caricamento provvigioni...</div>
      ) : filteredCommissions.length === 0 ? (
        <div className="admin-empty">Nessuna provvigione trovata</div>
      ) : (
        <div className="admin-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>FATTURA #</th>
                <th>AZIENDA</th>
                <th>CLIENTE</th>
                <th>DATA</th>
                <th className="num">TOTALE</th>
                <th className="num">%</th>
                <th className="num">LORDO</th>
                <th className="num">NETTO</th>
                <th>STATO</th>
                <th>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommissions.map(comm => {
                const inv = comm.invoice || {};
                const isExpanded = expandedId === comm.invoice_id;
                return (
                  <React.Fragment key={comm.id}>
                    <tr
                      className={`clickable-row ${isExpanded ? 'expanded-row' : ''}`}
                      onClick={() => handleExpand(comm.invoice_id)}
                    >
                      <td><strong>{inv.invoice_number || 'N/D'}</strong></td>
                      <td>{inv.company?.name || '-'}</td>
                      <td>{inv.client?.name || '-'}</td>
                      <td>{formatDate(inv.invoice_date)}</td>
                      <td className="num admin-amount">{formatCurrency(inv.total_amount || 0)}</td>
                      <td className="num">{formatPercent(comm.commission_rate_percent)}</td>
                      <td className="num admin-amount">{formatCurrency(comm.gross_commission)}</td>
                      <td className="num admin-amount">{formatCurrency(comm.net_commission)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <select
                          className="admin-status-select"
                          value={comm.commission_status}
                          onChange={e => handleStatusChange(comm.invoice_id, e.target.value)}
                        >
                          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button className="admin-btn-icon" title="Override" onClick={() => openOverrideModal(comm)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="admin-btn-icon" title="Ricalcola" onClick={() => handleRecalculate(comm.invoice_id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && expandedDetail && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0 }}>
                          <div className="admin-sub-table-wrap">
                            <div style={{ marginBottom: '0.75rem' }}>
                              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                {comm.manual_override ? 'Override manuale attivo' : 'Calcolato automaticamente'}
                                {comm.notes ? ` - Note: ${comm.notes}` : ''}
                              </span>
                            </div>

                            {/* Sub-agent commissions */}
                            {expandedDetail.sub_agent_commissions && expandedDetail.sub_agent_commissions.length > 0 ? (
                              <>
                                <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '0.5rem' }}>
                                  Provvigioni Subagenti
                                </strong>
                                <table className="admin-sub-table">
                                  <thead>
                                    <tr>
                                      <th>SUBAGENTE</th>
                                      <th className="num">TASSO %</th>
                                      <th>CALCOLO SU</th>
                                      <th className="num">IMPORTO</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedDetail.sub_agent_commissions.map((sac: any) => (
                                      <tr key={sac.id}>
                                        <td><strong>{sac.sub_agent?.name || sac.sub_agent_id}</strong></td>
                                        <td className="num">{formatPercent(sac.rate_percent)}</td>
                                        <td>{sac.calc_on === 'gross' ? 'Lordo' : 'Residuo'}</td>
                                        <td className="num">{formatCurrency(sac.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            ) : (
                              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                                Nessuna provvigione subagente per questa fattura.
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

      {/* Override Modal */}
      {showOverride && (
        <div className="admin-modal-overlay" onClick={() => setShowOverride(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Override Provvigione</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="admin-form-group">
                <label>Tasso % (opzionale)</label>
                <input type="number" step="0.1" min="0" max="100" value={overridePercent} onChange={e => setOverridePercent(e.target.value)} placeholder="Nuovo tasso %" />
              </div>
              <div className="admin-form-group">
                <label>Importo manuale (opzionale)</label>
                <input type="number" step="0.01" min="0" value={overrideAmount} onChange={e => setOverrideAmount(e.target.value)} placeholder="Importo fisso" />
              </div>
              <div className="admin-form-group">
                <label>Note</label>
                <textarea value={overrideNotes} onChange={e => setOverrideNotes(e.target.value)} placeholder="Motivo override..." />
              </div>
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowOverride(false)}>Annulla</button>
              <button className="admin-btn admin-btn-primary" onClick={handleOverrideSave} disabled={savingOverride}>
                {savingOverride ? 'Salvataggio...' : 'Salva Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionInvoices;
