import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company, Showroom, ShowroomStatus } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Showrooms.css';

// ---- Status helpers ----
const STATUS_CONFIG: Record<ShowroomStatus, { label: string; color: string }> = {
  open:    { label: 'Open',    color: '#5B8A65' },
  closed:  { label: 'Closed',  color: '#8A7F72' },
  opening: { label: 'Opening', color: '#B09840' },
  none:    { label: 'None',    color: '#b0b0b0' },
};

const TYPE_LABELS: Record<string, string> = {
  shop_in_shop: 'Shop in Shop',
  dedicated: 'Dedicated',
};

// ---- Component ----
export const Showrooms: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [citySearch, setCitySearch] = useState('');

  // Highlight
  const [highlightClientId, setHighlightClientId] = useState<string | null>(null);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [exporting, setExporting] = useState(false);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Highlight from URL
  useEffect(() => {
    const hc = searchParams.get('highlightClient');
    if (hc) {
      setHighlightClientId(hc);
      const t = setTimeout(() => setHighlightClientId(null), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // ---- Data loading ----
  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadShowrooms(); }, [clientId, companyId, statusFilter, areaFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) setClients(r.data);
      } catch {}
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}
      await loadShowrooms();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadShowrooms = async () => {
    try {
      const filters: any = {};
      if (clientId) filters.clientId = clientId;
      if (companyId) filters.companyId = companyId;
      if (statusFilter) filters.status = statusFilter;
      if (areaFilter) filters.area = areaFilter;

      const response = await apiService.getShowrooms(filters);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setShowrooms(data);
      }
    } catch {
      setError('Error loading showrooms');
    }
  };

  // ---- Actions ----
  const handleDelete = async (showroomId: string) => {
    if (!window.confirm('Delete this showroom?')) return;
    try {
      await apiService.deleteShowroom(showroomId);
      setSuccess('Showroom deleted');
      loadShowrooms();
    } catch {
      setError('Error deleting showroom');
    }
  };

  // ---- Computed data ----
  const getClientName = useCallback((id: string) => {
    return clients.find(c => c.id === id)?.name || '-';
  }, [clients]);

  const getCompanyName = useCallback((id: string) => {
    return companies.find(c => c.id === id)?.name || '-';
  }, [companies]);

  // Filter by city locally
  const filteredShowrooms = useMemo(() => {
    if (!citySearch.trim()) return showrooms;
    const q = citySearch.trim().toLowerCase();
    return showrooms.filter(s => s.city?.toLowerCase().includes(q));
  }, [showrooms, citySearch]);

  // Unique areas for filter dropdown
  const areas = useMemo(() => {
    const set = new Set<string>();
    showrooms.forEach(s => { if (s.area) set.add(s.area); });
    return [...set].sort();
  }, [showrooms]);

  // KPIs
  const kpis = useMemo(() => {
    let open = 0, closed = 0, opening = 0, none = 0, totalSqm = 0;
    for (const s of showrooms) {
      if (s.status === 'open') open++;
      else if (s.status === 'closed') closed++;
      else if (s.status === 'opening') opening++;
      else none++;
      if (s.sqm) totalSqm += s.sqm;
    }
    return { open, closed, opening, none, total: showrooms.length, totalSqm };
  }, [showrooms]);

  // ---- Export ----
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters: any = {};
      if (clientId) filters.clientId = clientId;
      if (companyId) filters.companyId = companyId;
      if (statusFilter) filters.status = statusFilter;
      if (areaFilter) filters.area = areaFilter;
      const blob = format === 'pdf'
        ? await apiService.exportShowroomsPdf(filters)
        : await apiService.exportShowroomsExcel(filters);
      downloadBlob(blob, `showrooms-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="sr-page"><div className="sr-loading">Loading showrooms...</div></div>;
  }

  return (
    <div className="sr-page">
      {/* Header */}
      <div className="sr-header">
        <div className="sr-header-left">
          <h1>Showrooms</h1>
          <p className="sr-header-subtitle">Manage showrooms</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            style={{ padding: '0.5rem 0.75rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
          >
            PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting}
            style={{ padding: '0.5rem 0.75rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Excel
          </button>
          <button className="sr-btn-new" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} onClick={() => navigate('/showrooms/map')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem', verticalAlign: 'middle' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Map View
          </button>
          <button className="sr-btn-new" onClick={() => navigate('/showrooms/new')}>
            + New Showroom
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="sr-alert sr-alert-error">{error}</div>}
      {success && <div className="sr-alert sr-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="sr-kpi-row">
        <div className="sr-kpi kpi-total">
          <div className="sr-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div className="sr-kpi-body">
            <div className="sr-kpi-value">{kpis.total}</div>
            <div className="sr-kpi-label">Total</div>
          </div>
        </div>
        <div className="sr-kpi kpi-open">
          <div className="sr-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="sr-kpi-body">
            <div className="sr-kpi-value">{kpis.open}</div>
            <div className="sr-kpi-label">Open</div>
          </div>
        </div>
        <div className="sr-kpi kpi-closed">
          <div className="sr-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          </div>
          <div className="sr-kpi-body">
            <div className="sr-kpi-value">{kpis.closed}</div>
            <div className="sr-kpi-label">Closed</div>
          </div>
        </div>
        <div className="sr-kpi kpi-opening">
          <div className="sr-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="sr-kpi-body">
            <div className="sr-kpi-value">{kpis.opening}</div>
            <div className="sr-kpi-label">Opening</div>
          </div>
        </div>
        <div className="sr-kpi kpi-sqm">
          <div className="sr-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
          </div>
          <div className="sr-kpi-body">
            <div className="sr-kpi-value">{kpis.totalSqm.toLocaleString()}</div>
            <div className="sr-kpi-label">Total SQM</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="sr-toolbar">
        <div className="sr-filters-row">
          <select
            className={`sr-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`sr-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Suppliers</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`sr-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="opening">Opening</option>
            <option value="none">None</option>
          </select>

          <select
            className={`sr-filter-select${areaFilter ? ' active' : ''}`}
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <input
            type="text"
            className="sr-filter-input"
            placeholder="Search city..."
            value={citySearch}
            onChange={e => setCitySearch(e.target.value)}
          />

          {(clientId || companyId || statusFilter || areaFilter || citySearch) && (
            <button
              type="button"
              className="sr-reset-btn"
              onClick={() => {
                setClientId('');
                setCompanyId('');
                setStatusFilter('');
                setAreaFilter('');
                setCitySearch('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="sr-table-wrap">
        {filteredShowrooms.length > 0 && (
          <div className="sr-result-count">
            {filteredShowrooms.length} showroom{filteredShowrooms.length !== 1 ? 's' : ''}
          </div>
        )}

        {filteredShowrooms.length === 0 ? (
          <div className="sr-empty">
            <div className="sr-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div className="sr-empty-text">No showrooms found</div>
            <div className="sr-empty-hint">Try adjusting your filters or create a new showroom</div>
          </div>
        ) : (
          <div className="sr-table-scroll">
            <table className="sr-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Name</th>
                  <th style={{ width: '12%' }}>Client</th>
                  <th style={{ width: '12%' }}>Supplier</th>
                  <th style={{ width: '8%' }}>Status</th>
                  <th style={{ width: '8%' }}>Type</th>
                  <th style={{ width: '6%' }}>SQM</th>
                  <th style={{ width: '15%' }}>City / Area</th>
                  <th style={{ width: '6%' }}>Photos</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShowrooms.map(sr => {
                  const photoCount = (sr.albums || []).reduce((sum, a) => sum + (a.photos?.length || 0), 0);
                  const isHighlighted = highlightClientId && sr.client_id === highlightClientId;
                  return (
                    <tr
                      key={sr.id}
                      className={isHighlighted ? 'sr-row-highlight' : ''}
                      onDoubleClick={() => navigate(`/showrooms/${sr.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="sr-name">{sr.name}</div>
                      </td>
                      <td>{sr.client?.name || getClientName(sr.client_id)}</td>
                      <td>{sr.company?.name || (sr.company_id ? getCompanyName(sr.company_id) : '-')}</td>
                      <td>
                        <span className={`sr-status-pill status-${sr.status}`}>
                          <span className="sr-status-dot" />
                          {STATUS_CONFIG[sr.status]?.label || sr.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {sr.type ? (TYPE_LABELS[sr.type] || sr.type) : '-'}
                      </td>
                      <td>{sr.sqm ?? '-'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {[sr.city, sr.area].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{photoCount || '-'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="sr-actions">
                          <button
                            className="sr-action-btn primary"
                            onClick={() => navigate(`/showrooms/${sr.id}`)}
                          >
                            View
                          </button>
                          <button
                            className="sr-action-btn"
                            onClick={() => navigate(`/showrooms/${sr.id}/edit`)}
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              className="sr-action-btn danger"
                              onClick={() => handleDelete(sr.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Showrooms;
