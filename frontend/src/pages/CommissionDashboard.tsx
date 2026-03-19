import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services/api';

const ABK_GROUP_NAMES = ['Materia', 'Abk Stone', 'Abk Group', 'Gardenia Ariana', 'Versace', 'Abk', 'Flaviker'];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

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

export const CommissionDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Get unique countries from clients
  const countries = useMemo(() =>
    [...new Set(clients.map((c: any) => c.country).filter(Boolean))].sort(),
    [clients]);

  // Resolve company filter to IDs
  const getCompanyFilter = useCallback(() => {
    if (filterCompany === 'gruppo_abk') {
      const ids = companies.filter(c => ABK_GROUP_NAMES.some(n => c.name.toLowerCase().includes(n.toLowerCase()))).map(c => c.id);
      return { company_ids: ids.join(',') };
    }
    if (filterCompany) return { company_id: filterCompany };
    return {};
  }, [filterCompany, companies]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const compFilter = getCompanyFilter();
      const [statsRes, compRes, cliRes] = await Promise.all([
        apiService.getCommissionStats({
          ...compFilter,
          country: filterCountry || undefined,
          start_date: filterStartDate || undefined,
          end_date: filterEndDate || undefined,
          status: filterStatus || undefined,
        } as any),
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      setStats(statsRes.data);
      setCompanies(compRes.data || []);
      setClients(cliRes.data || []);
    } catch (err) {
      console.error('Errore caricamento statistiche provvigioni:', err);
    }
    setLoading(false);
  }, [filterCompany, filterCountry, filterStatus, filterStartDate, filterEndDate, getCompanyFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="admin-tab-content"><div className="admin-empty">Caricamento statistiche...</div></div>;
  if (!stats) return <div className="admin-tab-content"><div className="admin-empty">Nessun dato disponibile</div></div>;

  const byStatus = stats.by_status || [];
  const byCompany = stats.by_company || [];
  const byCountry = stats.by_country || [];
  const bySubAgent = stats.sub_agent_totals || [];

  return (
    <div className="admin-tab-content">
      {/* Filters */}
      <div className="admin-filters" style={{ flexWrap: 'wrap' }}>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">Tutte le Aziende</option>
          <option value="gruppo_abk" style={{ fontWeight: 700 }}>── Gruppo ABK ──</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}>
          <option value="">Tutti i Paesi</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tutti gli Stati</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
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
          <div className="admin-kpi-value">{formatCurrency(stats.total_sub_agents || 0)}</div>
          <div className="admin-kpi-label">PROVVIGIONI SUBAGENTI</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-value">{stats.count || 0}</div>
          <div className="admin-kpi-label">FATTURE</div>
        </div>
      </div>

      {/* By Status */}
      {byStatus.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">Per Stato</h3>
          <table className="admin-table">
            <thead>
              <tr><th>STATO</th><th className="num">FATTURE</th><th className="num">LORDO</th><th className="num">NETTO</th></tr>
            </thead>
            <tbody>
              {byStatus.map((row: any) => (
                <tr key={row.status}>
                  <td><span className={`comm-status comm-status-${row.status}`}>{statusLabel(row.status)}</span></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_gross)}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_net)}</td>
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
              <tr><th>AZIENDA</th><th className="num">FATTURE</th><th className="num">LORDO</th><th className="num">NETTO</th></tr>
            </thead>
            <tbody>
              {byCompany.map((row: any) => (
                <tr key={row.company_id}>
                  <td><strong>{row.company_name}</strong></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_gross)}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Country */}
      {byCountry.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">Per Nazione</h3>
          <table className="admin-table">
            <thead>
              <tr><th>NAZIONE</th><th className="num">FATTURE</th><th className="num">LORDO</th><th className="num">NETTO</th></tr>
            </thead>
            <tbody>
              {byCountry.map((row: any) => (
                <tr key={row.country}>
                  <td><strong>{row.country}</strong></td>
                  <td className="num">{row.count}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_gross)}</td>
                  <td className="num admin-amount">{formatCurrency(row.total_net)}</td>
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
              <tr><th>SUBAGENTE</th><th className="num">FATTURE</th><th className="num">PROVVIGIONI</th></tr>
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

export default CommissionDashboard;
