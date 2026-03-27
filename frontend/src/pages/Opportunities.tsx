import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Opportunity, Client, Company } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Opportunities.css';

// ---- Status helpers ----
type OppStatus = 'open' | 'in_progress' | 'qualified' | 'negotiation' | 'closed_won' | 'closed_lost';

const STATUS_CONFIG: Record<OppStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: '#B09840' },
  in_progress: { label: 'In Progress', color: '#4A6078' },
  qualified:   { label: 'Qualified',   color: '#7B68AE' },
  negotiation: { label: 'Negotiation', color: '#C07832' },
  closed_won:  { label: 'Closed Won',  color: '#5B8A65' },
  closed_lost: { label: 'Closed Lost', color: '#9E5A52' },
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const formatCurrency = (val?: number, currency?: string) => {
  if (val == null) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(val);
};

// ---- Component ----
export const Opportunities: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Expand
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Handle highlight from URL
  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (highlight) {
      setHighlightId(highlight);
      setTimeout(() => {
        const element = document.getElementById(`opp-${highlight}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      const timer = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ---- Data loading ----
  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadOpportunities(); }, [clientId, companyId, statusFilter]);

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
      await loadOpportunities();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadOpportunities = async () => {
    try {
      const filters: any = {};
      if (clientId) filters.client_id = clientId;
      if (companyId) filters.company_id = companyId;
      if (statusFilter) filters.status = statusFilter;

      const response = await apiService.getOpportunities(filters);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setOpportunities(data);
      }
    } catch {
      setError('Error loading opportunities');
    }
  };

  // ---- Actions ----
  const handleDelete = async (oppId: string) => {
    if (!window.confirm('Delete this opportunity?')) return;
    try {
      await apiService.deleteOpportunity(oppId);
      setSuccess('Opportunity deleted');
      loadOpportunities();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error deleting opportunity');
    }
  };

  const handleStatusChange = async (oppId: string, newStatus: string) => {
    try {
      await apiService.updateOpportunity(oppId, { status: newStatus });
      setOpportunities(prev => prev.map(o => o.id === oppId ? { ...o, status: newStatus as OppStatus } : o));
    } catch {
      setError('Error updating status');
    }
  };

  const canDelete = (opp: Opportunity) => {
    if (isAdmin) return true;
    return opp.created_by_user_id === user?.id;
  };

  // ---- Computed data ----
  const getClientName = useCallback((id: string) => {
    return clients.find(c => c.id === id)?.name || '-';
  }, [clients]);

  const getCompanyName = useCallback((id: string) => {
    return companies.find(c => c.id === id)?.name || '-';
  }, [companies]);

  // KPIs
  const kpis = useMemo(() => {
    let open = 0, inProgress = 0, qualified = 0, negotiation = 0, closedWon = 0, closedLost = 0;
    for (const o of opportunities) {
      if (o.status === 'open') open++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'qualified') qualified++;
      else if (o.status === 'negotiation') negotiation++;
      else if (o.status === 'closed_won') closedWon++;
      else if (o.status === 'closed_lost') closedLost++;
    }
    return { open, inProgress, qualified, negotiation, closedWon, closedLost };
  }, [opportunities]);

  // ---- Export ----
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters: any = {};
      if (clientId) filters.client_id = clientId;
      if (companyId) filters.company_id = companyId;
      if (statusFilter) filters.status = statusFilter;
      const blob = format === 'pdf'
        ? await apiService.exportOpportunitiesPdf(filters)
        : await apiService.exportOpportunitiesExcel(filters);
      downloadBlob(blob, `opportunities-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // ---- Status style helper ----
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'open': return { background: 'rgba(176, 152, 64, 0.08)', color: '#B09840', borderColor: 'rgba(176, 152, 64, 0.2)' };
      case 'in_progress': return { background: 'rgba(74, 96, 120, 0.08)', color: '#4A6078', borderColor: 'rgba(74, 96, 120, 0.2)' };
      case 'qualified': return { background: 'rgba(123, 104, 174, 0.08)', color: '#7B68AE', borderColor: 'rgba(123, 104, 174, 0.2)' };
      case 'negotiation': return { background: 'rgba(192, 120, 50, 0.08)', color: '#C07832', borderColor: 'rgba(192, 120, 50, 0.2)' };
      case 'closed_won': return { background: 'rgba(91, 138, 101, 0.08)', color: '#5B8A65', borderColor: 'rgba(91, 138, 101, 0.2)' };
      case 'closed_lost': return { background: 'rgba(158, 90, 82, 0.08)', color: '#9E5A52', borderColor: 'rgba(158, 90, 82, 0.2)' };
      default: return { background: 'rgba(142, 142, 147, 0.08)', color: '#636366', borderColor: 'rgba(142, 142, 147, 0.2)' };
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="opp-page"><div className="opp-loading">Loading opportunities...</div></div>;
  }

  return (
    <div className="opp-page">
      {/* Header */}
      <div className="opp-header">
        <div className="opp-header-left">
          <h1>Opportunities</h1>
          <p className="opp-header-subtitle">Track and manage sales opportunities through the pipeline</p>
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
          <button className="opp-btn-new" onClick={() => navigate('/opportunities/new')}>
            + New Opportunity
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="opp-alert opp-alert-error">{error}</div>}
      {success && <div className="opp-alert opp-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="opp-kpi-row">
        <div className="opp-kpi kpi-open">
          <div className="opp-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.open}</div>
            <div className="opp-kpi-label">Open</div>
          </div>
        </div>
        <div className="opp-kpi kpi-in-progress">
          <div className="opp-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.inProgress}</div>
            <div className="opp-kpi-label">In Progress</div>
          </div>
        </div>
        <div className="opp-kpi kpi-qualified">
          <div className="opp-kpi-icon purple">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.qualified}</div>
            <div className="opp-kpi-label">Qualified</div>
          </div>
        </div>
        <div className="opp-kpi kpi-negotiation">
          <div className="opp-kpi-icon amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.negotiation}</div>
            <div className="opp-kpi-label">Negotiation</div>
          </div>
        </div>
        <div className="opp-kpi kpi-closed-won">
          <div className="opp-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.closedWon}</div>
            <div className="opp-kpi-label">Won</div>
          </div>
        </div>
        <div className="opp-kpi kpi-closed-lost">
          <div className="opp-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div className="opp-kpi-body">
            <div className="opp-kpi-value">{kpis.closedLost}</div>
            <div className="opp-kpi-label">Lost</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="opp-toolbar">
        <div className="opp-filters-row">
          <select
            className={`opp-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`opp-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`opp-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="qualified">Qualified</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
          </select>

          {(clientId || companyId || statusFilter) && (
            <button
              type="button"
              className="opp-reset-btn"
              onClick={() => {
                setClientId('');
                setCompanyId('');
                setStatusFilter('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="opp-table-wrap">
        {opportunities.length > 0 && (
          <div className="opp-result-count">
            {opportunities.length} opportunit{opportunities.length !== 1 ? 'ies' : 'y'}
          </div>
        )}

        {opportunities.length === 0 ? (
          <div className="opp-empty">
            <div className="opp-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div className="opp-empty-text">No opportunities found</div>
            <div className="opp-empty-hint">Try adjusting your filters or create a new opportunity</div>
          </div>
        ) : (
          <div className="opp-table-scroll">
            <table className="opp-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Title</th>
                  <th style={{ width: '12%' }}>Client</th>
                  <th style={{ width: '12%' }}>Company</th>
                  <th style={{ width: '10%' }}>Value</th>
                  <th style={{ width: '9%' }}>Close Date</th>
                  <th style={{ width: '10%' }}>Status</th>
                  <th style={{ width: '5%' }}>Adv.</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map(opp => {
                  const advanceCount = opp.advances?.length || 0;
                  const statusStyle = getStatusStyle(opp.status);

                  return (
                    <React.Fragment key={opp.id}>
                    <tr id={`opp-${opp.id}`} className={highlightId === opp.id ? 'highlighted' : ''} onClick={() => setExpandedId(expandedId === opp.id ? null : opp.id)} onDoubleClick={() => navigate(`/opportunities/${opp.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="opp-client-name">
                          <span style={{ marginRight: '0.4rem', fontSize: '0.7rem', color: '#888' }}>{expandedId === opp.id ? '▼' : '▶'}</span>
                          {opp.title || opp.name}
                        </div>
                      </td>
                      <td>{opp.client?.name || getClientName(opp.client_id)}</td>
                      <td style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-medium)' as any, fontSize: '0.813rem' }}>
                        {opp.company?.name || getCompanyName(opp.company_id)}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{formatCurrency(opp.estimated_value, opp.currency)}</td>
                      <td>{opp.expected_close_date ? formatDate(opp.expected_close_date) : '-'}</td>
                      <td>
                        <select
                          value={opp.status}
                          onChange={e => { e.stopPropagation(); handleStatusChange(opp.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.688rem',
                            fontWeight: 600, border: '1px solid transparent', cursor: 'pointer',
                            fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none',
                            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.4rem center',
                            paddingRight: '1.5rem',
                            ...statusStyle,
                          }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="qualified">Qualified</option>
                          <option value="negotiation">Negotiation</option>
                          <option value="closed_won">Closed Won</option>
                          <option value="closed_lost">Closed Lost</option>
                        </select>
                      </td>
                      <td>
                        <span className="opp-advance-count">{advanceCount}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="opp-actions">
                          <button className="opp-action-btn primary" onClick={() => navigate(`/opportunities/${opp.id}`)}>
                            View
                          </button>
                          <button className="opp-action-btn" onClick={() => navigate(`/opportunities/${opp.id}/edit`)}>
                            Edit
                          </button>
                          {canDelete(opp) && (
                            <button className="opp-action-btn danger" onClick={() => handleDelete(opp.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === opp.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0.75rem 1rem', background: '#fafaf5', borderBottom: '2px solid #e8e5da' }}>
                          {opp.advances && opp.advances.length > 0 ? (
                            <div>
                              <strong style={{ fontSize: '0.8rem', color: '#555' }}>Advances ({opp.advances.length})</strong>
                              <div style={{ marginTop: '0.4rem' }}>
                                {[...opp.advances].sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()).map(adv => (
                                  <div key={adv.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.4rem 0', borderBottom: '1px solid #eee', fontSize: '0.82rem' }}>
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: '#666' }}>{adv.date ? formatDate(adv.date) : formatDate(adv.created_at)}</span>
                                    <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{adv.created_by_user?.name || '-'}</span>
                                    <span style={{ flex: 1, color: '#333' }}>{adv.description}</span>
                                    {adv.attachments && adv.attachments.length > 0 && (
                                      <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>📎 {adv.attachments.length}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.82rem', color: '#888' }}>No advances yet</span>
                          )}
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
    </div>
  );
};

export default Opportunities;
