import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

export const CommissionDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, compRes] = await Promise.all([
        apiService.getCommissionStats({
          company_id: filterCompany || undefined,
          start_date: filterStartDate || undefined,
          end_date: filterEndDate || undefined,
        }),
        apiService.getCompanies(),
      ]);
      setStats(statsRes.data);
      setCompanies(compRes.data || []);
    } catch (err) {
      console.error('Errore caricamento statistiche provvigioni:', err);
    }
    setLoading(false);
  }, [filterCompany, filterStartDate, filterEndDate]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="admin-tab-content"><div className="admin-empty">Caricamento statistiche...</div></div>;
  }

  if (!stats) {
    return <div className="admin-tab-content"><div className="admin-empty">Nessun dato disponibile</div></div>;
  }

  const byStatus = stats.by_status || [];
  const byCompany = stats.by_company || [];
  const bySubAgent = stats.by_sub_agent || [];

  return (
    <div className="admin-tab-content">
      {/* Filters */}
      <div className="admin-filters">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">Tutte le Aziende</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-row">
        <div className="admin-kpi-card">
          <div className="admin-kpi-value">{formatCurrency(stats.total_gross || 0)}</div>
          <div className="admin-kpi-label">PROVVIGIONI LORDE</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-value">{formatCurrency(stats.total_net || 0)}</div>
          <div className="admin-kpi-label">PROVVIGIONI NETTE</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-value">{formatCurrency(stats.total_sub_agent || 0)}</div>
          <div className="admin-kpi-label">PROVVIGIONI SUBAGENTI</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-value">{stats.total_invoices || 0}</div>
          <div className="admin-kpi-label">TOTALE FATTURE</div>
        </div>
      </div>

      {/* By Status */}
      {byStatus.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">Per Stato</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>STATO</th>
                <th className="num">FATTURE</th>
                <th className="num">LORDO</th>
                <th className="num">NETTO</th>
              </tr>
            </thead>
            <tbody>
              {byStatus.map((row: any) => (
                <tr key={row.status}>
                  <td><span className={`comm-status comm-status-${row.status}`}>{statusLabel(row.status)}</span></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.gross)}</td>
                  <td className="num admin-amount">{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Company */}
      {byCompany.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">Per Azienda</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>AZIENDA</th>
                <th className="num">FATTURE</th>
                <th className="num">LORDO</th>
                <th className="num">NETTO</th>
              </tr>
            </thead>
            <tbody>
              {byCompany.map((row: any) => (
                <tr key={row.company_id}>
                  <td><strong>{row.company_name}</strong></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.gross)}</td>
                  <td className="num admin-amount">{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Sub-Agent */}
      {bySubAgent.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">Per Subagente</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>SUBAGENTE</th>
                <th className="num">FATTURE</th>
                <th className="num">TOTALE</th>
              </tr>
            </thead>
            <tbody>
              {bySubAgent.map((row: any) => (
                <tr key={row.sub_agent_id}>
                  <td><strong>{row.sub_agent_name}</strong></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function statusLabel(s: string): string {
  switch (s) {
    case 'aggiunta': return 'Aggiunta';
    case 'controllata': return 'Controllata';
    case 'fatturata': return 'Fatturata';
    case 'pagata': return 'Pagata';
    case 'pagati_subagenti': return 'Pagati Subagenti';
    default: return s;
  }
}

export default CommissionDashboard;
