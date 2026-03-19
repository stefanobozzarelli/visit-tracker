import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtCur = (n: any) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fmtPct = (n: any) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(n) || 0) + '%';
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('it-IT') : '–';

interface SubAgentDetailProps {
  subAgentId: string;
  subAgentName: string;
  onBack: () => void;
}

export const SubAgentDetail: React.FC<SubAgentDetailProps> = ({ subAgentId, subAgentName, onBack }) => {
  const [commissions, setCommissions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expType, setExpType] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expNotes, setExpNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const qs = new URLSearchParams(params).toString();

      const [commRes, expRes] = await Promise.all([
        axios.get(`${API_BASE}/api/commissions/sub-agents/${subAgentId}/commissions${qs ? '?' + qs : ''}`, { headers: authHeader() }),
        axios.get(`${API_BASE}/api/commissions/sub-agents/${subAgentId}/expenses`, { headers: authHeader() }),
      ]);

      if (commRes.data?.success) {
        setCommissions(commRes.data.data.commissions || []);
        setTotals(commRes.data.data.totals || {});
      }
      if (expRes.data?.success) setExpenses(expRes.data.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [subAgentId, startDate, endDate]);

  const statusColors: Record<string, string> = {
    aggiunta: '#8C877C',
    controllata: '#4A6078',
    fatturata: '#A9793D',
    pagata: '#5F8A63',
    pagati_sub: '#5C7A68',
  };

  const totalExpenses = useMemo(() =>
    expenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0), [expenses]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expType || !expAmount) return;
    try {
      await axios.post(`${API_BASE}/api/commissions/sub-agents/${subAgentId}/expenses`,
        { expense_date: expDate, expense_type: expType, amount: Number(expAmount), notes: expNotes || null },
        { headers: authHeader() },
      );
      setShowExpenseForm(false);
      setExpType(''); setExpAmount(''); setExpNotes('');
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Eliminare questa spesa?')) return;
    try {
      await axios.delete(`${API_BASE}/api/commissions/sub-agents/${subAgentId}/expenses/${id}`, { headers: authHeader() });
      loadData();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="sub-agent-detail">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>← Indietro</button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#22211D' }}>Scheda {subAgentName}</h2>
          <p style={{ margin: 0, color: '#8C877C', fontSize: '1rem' }}>Provvigioni, spese e riepilogo</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#22211D' }}>{totals.count || 0}</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#8C877C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fatture</div>
        </div>
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4A6078' }}>{fmtCur(totals.total_amount)}</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#8C877C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totale Provvigioni</div>
        </div>
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#A9574D' }}>{fmtCur(totalExpenses)}</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#8C877C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totale Spese</div>
        </div>
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#5F8A63' }}>{fmtCur((totals.total_amount || 0) - totalExpenses)}</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#8C877C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo Netto</div>
        </div>
      </div>

      {/* Date filters */}
      <div className="admin-card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600, color: '#666258' }}>Periodo:</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #E7E2D8', borderRadius: '6px' }} />
        <span style={{ color: '#8C877C' }}>—</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #E7E2D8', borderRadius: '6px' }} />
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); }} className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}>
            Cancella filtro
          </button>
        )}
      </div>

      {/* Status breakdown */}
      {totals.by_status && Object.keys(totals.by_status).length > 0 && (
        <div className="admin-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>Riepilogo per Stato</h3>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {Object.entries(totals.by_status).map(([status, data]: [string, any]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.8125rem', fontWeight: 600,
                  backgroundColor: (statusColors[status] || '#8C877C') + '15', color: statusColors[status] || '#8C877C',
                }}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                <span style={{ fontWeight: 600, color: '#22211D' }}>{data.count}×</span>
                <span style={{ color: '#666258' }}>{fmtCur(data.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commissions table */}
      <div className="admin-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Provvigioni ({commissions.length})</h3>
        {loading ? (
          <p style={{ color: '#8C877C' }}>Caricamento...</p>
        ) : commissions.length === 0 ? (
          <p style={{ color: '#8C877C' }}>Nessuna provvigione trovata per questo periodo.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fattura</th>
                  <th>Azienda</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Tasso</th>
                  <th>Calcolo Su</th>
                  <th style={{ textAlign: 'right' }}>Importo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((sac: any) => {
                  const inv = sac.invoice_commission?.invoice;
                  const status = sac.invoice_commission?.commission_status || 'aggiunta';
                  return (
                    <tr key={sac.id}>
                      <td style={{ fontWeight: 600 }}>{inv?.invoice_number || '–'}</td>
                      <td>{inv?.company?.name || '–'}</td>
                      <td>{inv?.client?.name || '–'}</td>
                      <td>{fmtDate(inv?.invoice_date)}</td>
                      <td>{fmtPct(sac.rate_percent)}</td>
                      <td style={{ fontSize: '0.875rem', color: '#8C877C' }}>
                        {sac.calc_on === 'residual' ? 'Residuo' : 'Lordo'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCur(sac.amount)}</td>
                      <td>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: (statusColors[status] || '#8C877C') + '15', color: statusColors[status] || '#8C877C',
                        }}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #E7E2D8' }}>
                  <td colSpan={6}>Totale</td>
                  <td style={{ textAlign: 'right' }}>{fmtCur(totals.total_amount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Expenses section */}
      <div className="admin-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Spese ({expenses.length})</h3>
          <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            + Nuova Spesa
          </button>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleAddExpense} style={{
            display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap',
            padding: '1rem', background: '#FBF9F4', borderRadius: '8px', marginBottom: '1rem',
          }}>
            <div className="admin-form-group" style={{ flex: '0 0 auto' }}>
              <label>Data</label>
              <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} required />
            </div>
            <div className="admin-form-group" style={{ flex: '1 1 150px' }}>
              <label>Tipo Spesa</label>
              <select value={expType} onChange={e => setExpType(e.target.value)} required>
                <option value="">Seleziona...</option>
                <option value="viaggio">Viaggio</option>
                <option value="alloggio">Alloggio</option>
                <option value="pasto">Pasto</option>
                <option value="trasporto">Trasporto</option>
                <option value="campionatura">Campionatura</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div className="admin-form-group" style={{ flex: '0 0 120px' }}>
              <label>Importo (€)</label>
              <input type="number" step="0.01" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0,00" required />
            </div>
            <div className="admin-form-group" style={{ flex: '1 1 200px' }}>
              <label>Note</label>
              <input type="text" value={expNotes} onChange={e => setExpNotes(e.target.value)} placeholder="Note opzionali..." />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Salva</button>
              <button type="button" onClick={() => setShowExpenseForm(false)} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>Annulla</button>
            </div>
          </form>
        )}

        {expenses.length === 0 ? (
          <p style={{ color: '#8C877C' }}>Nessuna spesa registrata.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Importo</th>
                <th>Note</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp: any) => (
                <tr key={exp.id}>
                  <td>{fmtDate(exp.expense_date)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{exp.expense_type}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCur(exp.amount)}</td>
                  <td style={{ color: '#8C877C', fontSize: '0.875rem' }}>{exp.notes || '–'}</td>
                  <td>
                    <button onClick={() => handleDeleteExpense(exp.id)} className="btn-danger-text" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}>
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #E7E2D8' }}>
                <td colSpan={2}>Totale Spese</td>
                <td style={{ textAlign: 'right' }}>{fmtCur(totalExpenses)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};
