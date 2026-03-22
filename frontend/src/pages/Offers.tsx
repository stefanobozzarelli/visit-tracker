import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Offer, Client, Company } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Offers.css';

// ---- Status helpers ----
type OfferStatusKey = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

const STATUS_CONFIG: Record<OfferStatusKey, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: '#b0b0b0' },
  sent:     { label: 'Sent',     color: '#3498DB' },
  accepted: { label: 'Accepted', color: '#2ECC71' },
  rejected: { label: 'Rejected', color: '#E74C3C' },
  expired:  { label: 'Expired',  color: '#8A7F72' },
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

// ---- Component ----
export const Offers: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [offers, setOffers] = useState<Offer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [localSearch, setLocalSearch] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Offer | null>(null);

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
        const element = document.getElementById(`offer-${highlight}`);
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
  useEffect(() => { loadOffers(); }, [clientId, companyId, statusFilter]);

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
      await loadOffers();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadOffers = async () => {
    try {
      const filters: any = {};
      if (clientId) filters.client_id = clientId;
      if (companyId) filters.company_id = companyId;
      if (statusFilter) filters.status = statusFilter;

      const response = await apiService.getOffers(filters);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setOffers(data);
      }
    } catch {
      setError('Error loading offers');
    }
  };

  // ---- Actions ----
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiService.deleteOffer(deleteTarget.id);
      setSuccess('Offer deleted');
      setDeleteTarget(null);
      loadOffers();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error deleting offer');
      setDeleteTarget(null);
    }
  };

  const canDeleteOffer = (offer: Offer) => {
    if (isAdmin) return true;
    return offer.created_by_user_id === user?.id;
  };

  // ---- Computed data ----
  const getClientName = useCallback((id: string) => {
    return clients.find(c => c.id === id)?.name || '-';
  }, [clients]);

  const getCompanyName = useCallback((id: string) => {
    return companies.find(c => c.id === id)?.name || '-';
  }, [companies]);

  // Local search filter
  const filteredOffers = useMemo(() => {
    if (!localSearch.trim()) return offers;
    const q = localSearch.toLowerCase();
    return offers.filter(o => {
      const clientName = (o.client?.name || getClientName(o.client_id || '')).toLowerCase();
      const companyName = (o.company?.name || getCompanyName(o.company_id || '')).toLowerCase();
      const status = o.status.toLowerCase();
      const notes = (o.notes || '').toLowerCase();
      return clientName.includes(q) || companyName.includes(q) || status.includes(q) || notes.includes(q);
    });
  }, [offers, localSearch, getClientName, getCompanyName]);

  // KPIs
  const kpis = useMemo(() => {
    let total = offers.length, draft = 0, sent = 0, accepted = 0;
    for (const o of offers) {
      if (o.status === 'draft') draft++;
      else if (o.status === 'sent') sent++;
      else if (o.status === 'accepted') accepted++;
    }
    return { total, draft, sent, accepted };
  }, [offers]);

  // ---- Export ----
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters: any = {};
      if (clientId) filters.client_id = clientId;
      if (companyId) filters.company_id = companyId;
      if (statusFilter) filters.status = statusFilter;
      const blob = format === 'pdf'
        ? await apiService.exportOffersPdf(filters)
        : await apiService.exportOffersExcel(filters);
      downloadBlob(blob, `offers-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="off-page"><div className="off-loading">Loading offers...</div></div>;
  }

  return (
    <div className="off-page">
      {/* Header */}
      <div className="off-header">
        <div className="off-header-left">
          <h1>Offers</h1>
          <p className="off-header-subtitle">Track and manage client offers and proposals</p>
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
          <button className="off-btn-new" onClick={() => navigate('/offers/new')}>
            + New Offer
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="off-alert off-alert-error">{error}</div>}
      {success && <div className="off-alert off-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="off-kpi-row">
        <div className="off-kpi kpi-total">
          <div className="off-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div className="off-kpi-body">
            <div className="off-kpi-value">{kpis.total}</div>
            <div className="off-kpi-label">Total</div>
          </div>
        </div>
        <div className="off-kpi kpi-draft">
          <div className="off-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <div className="off-kpi-body">
            <div className="off-kpi-value">{kpis.draft}</div>
            <div className="off-kpi-label">Draft</div>
          </div>
        </div>
        <div className="off-kpi kpi-sent">
          <div className="off-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </div>
          <div className="off-kpi-body">
            <div className="off-kpi-value">{kpis.sent}</div>
            <div className="off-kpi-label">Sent</div>
          </div>
        </div>
        <div className="off-kpi kpi-accepted">
          <div className="off-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="off-kpi-body">
            <div className="off-kpi-value">{kpis.accepted}</div>
            <div className="off-kpi-label">Accepted</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="off-toolbar">
        <div className="off-filters-row">
          <select
            className={`off-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`off-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Suppliers</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`off-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>

          <input
            type="text"
            className="off-search-input"
            placeholder="Search..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />

          {(clientId || companyId || statusFilter || localSearch) && (
            <button
              type="button"
              className="off-reset-btn"
              onClick={() => {
                setClientId('');
                setCompanyId('');
                setStatusFilter('');
                setLocalSearch('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="off-table-wrap">
        {filteredOffers.length > 0 && (
          <div className="off-result-count">
            {filteredOffers.length} offer{filteredOffers.length !== 1 ? 's' : ''}
          </div>
        )}

        {filteredOffers.length === 0 ? (
          <div className="off-empty">
            <div className="off-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </div>
            <div className="off-empty-text">No offers found</div>
            <div className="off-empty-hint">Try adjusting your filters or create a new offer</div>
          </div>
        ) : (
          <div className="off-table-scroll">
            <table className="off-table">
              <thead>
                <tr>
                  <th style={{ width: '9%' }}>Date</th>
                  <th style={{ width: '14%' }}>Client</th>
                  <th style={{ width: '14%' }}>Supplier</th>
                  <th style={{ width: '9%' }}>Status</th>
                  <th style={{ width: '6%' }}>Items</th>
                  <th style={{ width: '10%' }}>Total</th>
                  <th style={{ width: '9%' }}>Valid Until</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOffers.map(offer => {
                  const itemCount = offer.items?.length || 0;
                  const statusCfg = STATUS_CONFIG[offer.status as OfferStatusKey] || STATUS_CONFIG.draft;

                  return (
                    <tr key={offer.id} id={`offer-${offer.id}`} className={highlightId === offer.id ? 'highlighted' : ''} onDoubleClick={() => navigate(`/offers/${offer.id}`)} style={{ cursor: 'pointer' }}>
                      <td>{formatDate(offer.offer_date)}</td>
                      <td>
                        <div className="off-name">
                          {offer.client?.name || getClientName(offer.client_id || '')}
                        </div>
                      </td>
                      <td>
                        <div className="off-name">
                          {offer.company?.name || getCompanyName(offer.company_id || '')}
                        </div>
                      </td>
                      <td>
                        <span
                          className="off-status-badge"
                          style={{
                            background: `${statusCfg.color}18`,
                            color: statusCfg.color,
                            borderColor: `${statusCfg.color}33`,
                          }}
                        >
                          <span className="off-status-dot" style={{ backgroundColor: statusCfg.color }} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{itemCount}</td>
                      <td style={{ fontWeight: 600 }}>
                        {offer.total_amount != null ? `${offer.currency || '\u20AC'} ${Number(offer.total_amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td>{offer.valid_until ? formatDate(offer.valid_until) : '-'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="off-actions">
                          <button
                            className="off-action-btn primary"
                            onClick={() => navigate(`/offers/${offer.id}`)}
                          >
                            View
                          </button>
                          <button
                            className="off-action-btn"
                            onClick={() => navigate(`/offers/${offer.id}/edit`)}
                          >
                            Edit
                          </button>
                          {canDeleteOffer(offer) && (
                            <button
                              className="off-action-btn danger"
                              onClick={() => setDeleteTarget(offer)}
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

      {/* Delete modal */}
      {deleteTarget && (
        <div className="off-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="off-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Offer</h3>
            <p>Are you sure you want to delete this offer? This action cannot be undone.</p>
            <div className="off-modal-actions">
              <button className="off-modal-btn cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="off-modal-btn danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Offers;
