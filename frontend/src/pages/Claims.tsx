import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Claim, Client, Company } from '../types';
import '../styles/Claims.css';

// ---- Status helpers ----
type ClaimStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

const STATUS_CONFIG: Record<ClaimStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: '#ff9500' },
  in_progress: { label: 'In Progress', color: '#007aff' },
  resolved:    { label: 'Resolved',    color: '#34c759' },
  closed:      { label: 'Closed',      color: '#8e8e93' },
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

// ---- Component ----
export const Claims: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [claims, setClaims] = useState<Claim[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);

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
        const element = document.getElementById(`claim-${highlight}`);
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
  useEffect(() => { loadClaims(); }, [clientId, companyId, statusFilter]);

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
      await loadClaims();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadClaims = async () => {
    try {
      const filters: any = {};
      if (clientId) filters.client_id = clientId;
      if (companyId) filters.company_id = companyId;
      if (statusFilter) filters.status = statusFilter;

      const response = await apiService.getClaims(filters);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setClaims(data);
      }
    } catch {
      setError('Error loading claims');
    }
  };

  // ---- Actions ----
  const handleDelete = async (claimId: string) => {
    if (!window.confirm('Delete this claim?')) return;
    try {
      await apiService.deleteClaim(claimId);
      setSuccess('Claim deleted');
      loadClaims();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error deleting claim');
    }
  };

  const handleStatusChange = async (claimId: string, newStatus: string) => {
    try {
      await apiService.updateClaim(claimId, { status: newStatus });
      setClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: newStatus } : c));
    } catch {
      setError('Error updating status');
    }
  };

  const canDeleteClaim = (claim: Claim) => {
    if (isAdmin) return true;
    return (claim as any).created_by_user_id === user?.id;
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
    let open = 0, inProgress = 0, resolved = 0, closed = 0;
    for (const c of claims) {
      if (c.status === 'open') open++;
      else if (c.status === 'in_progress') inProgress++;
      else if (c.status === 'resolved') resolved++;
      else if (c.status === 'closed') closed++;
    }
    return { open, inProgress, resolved, closed };
  }, [claims]);

  // ---- Render ----
  if (loading) {
    return <div className="claims-page"><div className="claims-loading">Loading claims...</div></div>;
  }

  return (
    <div className="claims-page">
      {/* Header */}
      <div className="claims-header">
        <div className="claims-header-left">
          <h1>Claims</h1>
          <p className="claims-header-subtitle">Track and manage client claims and resolutions</p>
        </div>
        <button className="claims-btn-new" onClick={() => navigate('/claims/new')}>
          + New Claim
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="claims-alert claims-alert-error">{error}</div>}
      {success && <div className="claims-alert claims-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="claims-kpi-row">
        <div className="claims-kpi kpi-open">
          <div className="claims-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="claims-kpi-body">
            <div className="claims-kpi-value">{kpis.open}</div>
            <div className="claims-kpi-label">Open</div>
          </div>
        </div>
        <div className="claims-kpi kpi-in-progress">
          <div className="claims-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </div>
          <div className="claims-kpi-body">
            <div className="claims-kpi-value">{kpis.inProgress}</div>
            <div className="claims-kpi-label">In Progress</div>
          </div>
        </div>
        <div className="claims-kpi kpi-resolved">
          <div className="claims-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="claims-kpi-body">
            <div className="claims-kpi-value">{kpis.resolved}</div>
            <div className="claims-kpi-label">Resolved</div>
          </div>
        </div>
        <div className="claims-kpi kpi-closed">
          <div className="claims-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          </div>
          <div className="claims-kpi-body">
            <div className="claims-kpi-value">{kpis.closed}</div>
            <div className="claims-kpi-label">Closed</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="claims-toolbar">
        <div className="claims-filters-row">
          <select
            className={`claims-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`claims-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`claims-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          {(clientId || companyId || statusFilter) && (
            <button
              type="button"
              className="claims-reset-btn"
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
      <div className="claims-table-wrap">
        {claims.length > 0 && (
          <div className="claims-result-count">
            {claims.length} claim{claims.length !== 1 ? 's' : ''}
          </div>
        )}

        {claims.length === 0 ? (
          <div className="claims-empty">
            <div className="claims-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </div>
            <div className="claims-empty-text">No claims found</div>
            <div className="claims-empty-hint">Try adjusting your filters or create a new claim</div>
          </div>
        ) : (
          <div className="claims-table-scroll">
            <table className="claims-table">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Client</th>
                  <th style={{ width: '12%' }}>Company (Supplier)</th>
                  <th style={{ width: '8%' }}>Date</th>
                  <th>Comments</th>
                  <th style={{ width: '10%' }}>Status</th>
                  <th style={{ width: '6%' }}>Mov.</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(claim => {
                  const movementCount = claim.movements?.length || 0;

                  return (
                    <tr key={claim.id} id={`claim-${claim.id}`} className={highlightId === claim.id ? 'highlighted' : ''} onDoubleClick={() => navigate(`/claims/${claim.id}/edit`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="claim-client-name">
                          {claim.client?.name || getClientName(claim.client_id)}
                        </div>
                      </td>
                      <td>
                        <div className="claim-company-name" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-medium)' as any, fontSize: '0.813rem' }}>
                          {claim.company?.name || getCompanyName(claim.company_id)}
                        </div>
                      </td>
                      <td>{formatDate(claim.date)}</td>
                      <td style={{ maxWidth: '250px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {claim.comments ? (claim.comments.length > 80 ? claim.comments.substring(0, 80) + '...' : claim.comments) : '-'}
                      </td>
                      <td>
                        <select
                          className={`claim-status-select status-${claim.status}`}
                          value={claim.status}
                          onChange={e => { e.stopPropagation(); handleStatusChange(claim.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.688rem',
                            fontWeight: 600, border: '1px solid transparent', cursor: 'pointer',
                            fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none',
                            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.4rem center',
                            paddingRight: '1.5rem',
                            ...(claim.status === 'open' ? { background: 'rgba(255, 149, 0, 0.08)', color: '#c77700', borderColor: 'rgba(255, 149, 0, 0.2)' } :
                               claim.status === 'in_progress' ? { background: 'rgba(0, 122, 255, 0.08)', color: '#0062cc', borderColor: 'rgba(0, 122, 255, 0.2)' } :
                               claim.status === 'resolved' ? { background: 'rgba(52, 199, 89, 0.08)', color: '#248a3d', borderColor: 'rgba(52, 199, 89, 0.2)' } :
                               { background: 'rgba(142, 142, 147, 0.08)', color: '#636366', borderColor: 'rgba(142, 142, 147, 0.2)' }),
                          }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td>
                        <span className="claim-movement-count">
                          {movementCount}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="claim-actions">
                          <button
                            className="claim-action-btn primary"
                            onClick={() => navigate(`/claims/${claim.id}/edit`)}
                          >
                            View
                          </button>
                          <button
                            className="claim-action-btn"
                            onClick={() => navigate(`/claims/${claim.id}/edit`)}
                          >
                            Edit
                          </button>
                          {canDeleteClaim(claim) && (
                            <button
                              className="claim-action-btn danger"
                              onClick={() => handleDelete(claim.id)}
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

export default Claims;
