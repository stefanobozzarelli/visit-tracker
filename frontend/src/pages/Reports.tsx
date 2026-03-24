import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { downloadBlob } from '../utils/downloadBlob';
import { useAuth } from '../context/AuthContext';
import '../styles/Reports.css';

type TabKey = 'visits' | 'clients' | 'showrooms' | 'projects' | 'claims' | 'orders' | 'company-visits' | 'tasks';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'visits', label: 'Company Meetings' },
  { key: 'clients', label: 'Clients' },
  { key: 'showrooms', label: 'Showrooms' },
  { key: 'projects', label: 'Projects' },
  { key: 'claims', label: 'Claims' },
  { key: 'orders', label: 'Orders' },
  { key: 'company-visits', label: 'Company Visits' },
  { key: 'tasks', label: 'Tasks' },
];

const formatDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('it-IT'); } catch { return d; }
};

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [activeTab, setActiveTab] = useState<TabKey>('visits');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Reference data for filters
  const [clients, setClients] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Filters per tab
  const [filters, setFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadRefs = async () => {
      try {
        const [cRes, coRes] = await Promise.all([
          apiService.getClients(),
          apiService.getCompanies(),
        ]);
        if (cRes.success) setClients(cRes.data || []);
        if (coRes.success) setCompanies(coRes.data || []);
        try {
          const uRes = await (apiService as any).getUsers?.();
          if (uRes?.success) setUsers(uRes.data || []);
        } catch {}
      } catch {}
    };
    loadRefs();
  }, []);

  useEffect(() => {
    setFilters({});
    setData([]);
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      let res: any;
      switch (activeTab) {
        case 'visits':
          res = await apiService.getVisits({
            client_id: filters.clientId || undefined,
            company_id: filters.companyId || undefined,
            user_id: filters.userId || undefined,
            status: filters.status || undefined,
          });
          break;
        case 'clients':
          res = await apiService.getClients();
          break;
        case 'showrooms':
          res = await apiService.getShowrooms({
            clientId: filters.clientId || undefined,
            companyId: filters.companyId || undefined,
            status: filters.status || undefined,
            area: filters.area || undefined,
          });
          break;
        case 'projects':
          res = await apiService.getProjects({
            supplier_id: filters.companyId || undefined,
            client_id: filters.clientId || undefined,
            status: filters.status || undefined,
            country: filters.country || undefined,
          });
          break;
        case 'claims':
          res = await apiService.getClaims({
            client_id: filters.clientId || undefined,
            company_id: filters.companyId || undefined,
            status: filters.status || undefined,
          });
          break;
        case 'orders':
          res = await apiService.getOrders({
            client_id: filters.clientId || undefined,
            status: filters.status || undefined,
          });
          break;
        case 'company-visits':
          res = await apiService.getCompanyVisits({
            companyId: filters.companyId || undefined,
            status: filters.status || undefined,
          });
          break;
        case 'tasks':
          res = await apiService.getTodos({
            clientId: filters.clientId || undefined,
            companyId: filters.companyId || undefined,
            status: filters.status || undefined,
            assignedToUserId: filters.assignedTo || undefined,
          });
          break;
      }
      const items = Array.isArray(res?.data) ? res.data : [];
      // Apply date range filter client-side if set
      let filtered = items;
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        filtered = filtered.filter((item: any) => {
          const d = item.visit_date || item.date || item.order_date || item.created_at;
          return d && new Date(d) >= start;
        });
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        filtered = filtered.filter((item: any) => {
          const d = item.visit_date || item.date || item.order_date || item.created_at;
          return d && new Date(d) <= end;
        });
      }
      // Client-side country/role filter for clients
      if (activeTab === 'clients' && filters.country) {
        filtered = filtered.filter((c: any) => c.country === filters.country);
      }
      if (activeTab === 'clients' && filters.role) {
        filtered = filtered.filter((c: any) => (c.role || 'cliente') === filters.role);
      }
      setData(filtered);
    } catch (err) {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleApplyFilters = () => loadData();

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (data.length === 0) { setError('No data to export'); return; }
    setExporting(true);
    setError('');
    try {
      let blob: Blob;
      const f = { ...filters };
      switch (activeTab) {
        case 'visits':
          blob = format === 'pdf'
            ? await apiService.exportVisitsPdf(f)
            : await apiService.exportVisitsExcel(f);
          break;
        case 'clients':
          blob = format === 'pdf'
            ? await apiService.exportClientsPdf(f)
            : await apiService.exportClientsExcel(f);
          break;
        case 'showrooms':
          blob = format === 'pdf'
            ? await apiService.exportShowroomsPdf(f)
            : await apiService.exportShowroomsExcel(f);
          break;
        case 'projects':
          blob = format === 'pdf'
            ? await apiService.exportProjectsPdf(f)
            : await apiService.exportProjectsExcel(f);
          break;
        case 'claims':
          blob = format === 'pdf'
            ? await apiService.exportClaimsPdf(f)
            : await apiService.exportClaimsExcel(f);
          break;
        case 'orders':
          blob = format === 'pdf'
            ? await apiService.exportFilteredOrdersPdf(f)
            : await apiService.exportFilteredOrdersExcel(f);
          break;
        case 'company-visits':
          blob = format === 'pdf'
            ? await apiService.exportCompanyVisitsPdf(f)
            : await apiService.exportCompanyVisitsExcel(f);
          break;
        case 'tasks':
          blob = format === 'pdf'
            ? await apiService.exportTasksPdf(f)
            : await apiService.exportTasksExcel(f);
          break;
        default:
          return;
      }
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      downloadBlob(blob, `${activeTab}-report-${Date.now()}.${ext}`);
    } catch (err) {
      setError(`Error exporting ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  // Existing visits PDF export uses the old POST endpoint
  const exportVisitsPdf = async (f: any) => {
    const token = localStorage.getItem('token');
    const { default: axios } = await import('axios');
    const { config } = await import('../config');
    const response = await axios.post(`${config.API_BASE_URL}/visits/export-pdf`, {
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      clientId: f.clientId || null,
      companyId: f.companyId || null,
      userId: f.userId || null,
    }, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    });
    return response.data;
  };

  // Patch apiService with missing methods
  if (!(apiService as any).exportVisitsPdf) {
    (apiService as any).exportVisitsPdf = exportVisitsPdf;
  }

  const countries = useMemo(() => {
    return [...new Set(clients.map((c: any) => c.country).filter(Boolean))].sort();
  }, [clients]);

  const areas = useMemo(() => {
    if (activeTab !== 'showrooms') return [];
    return [...new Set(data.map((s: any) => s.area).filter(Boolean))].sort();
  }, [data, activeTab]);

  const renderFilters = () => {
    const setF = (key: string, val: string) => setFilters(prev => ({ ...prev, [key]: val }));

    const dateFilters = (
      <>
        <div className="rpt-filter-group">
          <label>Start Date</label>
          <input type="date" value={filters.startDate || ''} onChange={e => setF('startDate', e.target.value)} />
        </div>
        <div className="rpt-filter-group">
          <label>End Date</label>
          <input type="date" value={filters.endDate || ''} onChange={e => setF('endDate', e.target.value)} />
        </div>
      </>
    );

    const clientFilter = (
      <div className="rpt-filter-group">
        <label>Client</label>
        <select value={filters.clientId || ''} onChange={e => setF('clientId', e.target.value)}>
          <option value="">All Clients</option>
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    );

    const companyFilter = (
      <div className="rpt-filter-group">
        <label>Supplier</label>
        <select value={filters.companyId || ''} onChange={e => setF('companyId', e.target.value)}>
          <option value="">All Suppliers</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    );

    switch (activeTab) {
      case 'visits':
        return (
          <>
            {dateFilters}
            {clientFilter}
            {companyFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </>
        );
      case 'clients':
        return (
          <>
            <div className="rpt-filter-group">
              <label>Country</label>
              <select value={filters.country || ''} onChange={e => setF('country', e.target.value)}>
                <option value="">All Countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="rpt-filter-group">
              <label>Type</label>
              <select value={filters.role || ''} onChange={e => setF('role', e.target.value)}>
                <option value="">All Types</option>
                <option value="cliente">Client</option>
                <option value="developer">Developer</option>
                <option value="architetto-designer">Architect/Designer</option>
              </select>
            </div>
          </>
        );
      case 'showrooms':
        return (
          <>
            {clientFilter}
            {companyFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="opening">Opening</option>
              </select>
            </div>
            <div className="rpt-filter-group">
              <label>Area</label>
              <select value={filters.area || ''} onChange={e => setF('area', e.target.value)}>
                <option value="">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </>
        );
      case 'projects':
        return (
          <>
            {companyFilter}
            {clientFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="ATTIVO">Active</option>
                <option value="COMPLETATO">Completed</option>
                <option value="SOSPESO">Suspended</option>
                <option value="CANCELLATO">Cancelled</option>
              </select>
            </div>
            <div className="rpt-filter-group">
              <label>Country</label>
              <select value={filters.country || ''} onChange={e => setF('country', e.target.value)}>
                <option value="">All Countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        );
      case 'claims':
        return (
          <>
            {dateFilters}
            {clientFilter}
            {companyFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </>
        );
      case 'orders':
        return (
          <>
            {dateFilters}
            {clientFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </>
        );
      case 'company-visits':
        return (
          <>
            {dateFilters}
            {companyFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </>
        );
      case 'tasks':
        return (
          <>
            {clientFilter}
            {companyFilter}
            <div className="rpt-filter-group">
              <label>Status</label>
              <select value={filters.status || ''} onChange={e => setF('status', e.target.value)}>
                <option value="">All</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </>
        );
    }
  };

  const renderTable = () => {
    if (data.length === 0) return <div className="rpt-empty">No data found. Adjust filters and click Apply.</div>;

    switch (activeTab) {
      case 'visits':
        return (
          <table className="rpt-table">
            <thead><tr><th>Date</th><th>Client</th><th>Sales Rep</th><th>Status</th><th>Reports</th></tr></thead>
            <tbody>
              {data.map((v: any) => (
                <tr key={v.id}>
                  <td>{formatDate(v.visit_date)}</td>
                  <td>{v.client?.name || '-'}</td>
                  <td>{v.visited_by_user?.name || '-'}</td>
                  <td>{v.status}</td>
                  <td>{v.reports?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'clients':
        return (
          <table className="rpt-table">
            <thead><tr><th>Name</th><th>Country</th><th>City</th><th>Type</th><th>Contacts</th><th>Showroom</th></tr></thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.country}</td>
                  <td>{c.city || '-'}</td>
                  <td>{c.role || 'cliente'}</td>
                  <td>{c.contacts?.length || 0}</td>
                  <td>{c.has_showroom ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'showrooms':
        return (
          <table className="rpt-table">
            <thead><tr><th>Name</th><th>Client</th><th>Supplier</th><th>Status</th><th>Type</th><th>SQM</th><th>City</th><th>Area</th></tr></thead>
            <tbody>
              {data.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.client?.name || '-'}</td>
                  <td>{s.company?.name || '-'}</td>
                  <td>{s.status}</td>
                  <td>{s.type === 'shop_in_shop' ? 'Shop in Shop' : s.type === 'dedicated' ? 'Dedicated' : '-'}</td>
                  <td>{s.sqm || '-'}</td>
                  <td>{s.city || '-'}</td>
                  <td>{s.area || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'projects':
        return (
          <table className="rpt-table">
            <thead><tr><th>#</th><th>Name</th><th>Supplier</th><th>Client</th><th>Status</th><th>Country</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id}>
                  <td>{p.project_number}</td>
                  <td>{p.project_name || '-'}</td>
                  <td>{p.supplier?.name || '-'}</td>
                  <td>{p.client?.name || '-'}</td>
                  <td>{p.status}</td>
                  <td>{p.country || '-'}</td>
                  <td>{p.project_type || '-'}</td>
                  <td>{p.project_value ? `${Number(p.project_value).toLocaleString()}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'claims':
        return (
          <table className="rpt-table">
            <thead><tr><th>Date</th><th>Client</th><th>Company</th><th>Status</th><th>Comments</th></tr></thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td>{c.client?.name || '-'}</td>
                  <td>{c.company?.name || '-'}</td>
                  <td>{c.status}</td>
                  <td className="rpt-truncate">{c.comments || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'orders':
        return (
          <table className="rpt-table">
            <thead><tr><th>Date</th><th>Supplier</th><th>Client</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
            <tbody>
              {data.map((o: any) => (
                <tr key={o.id}>
                  <td>{formatDate(o.order_date)}</td>
                  <td>{o.supplier_name || '-'}</td>
                  <td>{o.client_name || o.client?.name || '-'}</td>
                  <td>{o.status}</td>
                  <td>{o.payment_method || '-'}</td>
                  <td>{o.total_amount ? `${Number(o.total_amount).toLocaleString()}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'company-visits':
        return (
          <table className="rpt-table">
            <thead><tr><th>Date</th><th>Company</th><th>Subject</th><th>Status</th><th>Participants</th></tr></thead>
            <tbody>
              {data.map((v: any) => (
                <tr key={v.id}>
                  <td>{formatDate(v.date)}</td>
                  <td>{v.company?.name || '-'}</td>
                  <td className="rpt-truncate">{v.subject || '-'}</td>
                  <td>{v.status}</td>
                  <td>{v.participants_external || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'tasks':
        return (
          <table className="rpt-table">
            <thead><tr><th>Title</th><th>Status</th><th>Due Date</th><th>Assigned To</th><th>Client</th><th>Company</th></tr></thead>
            <tbody>
              {data.map((t: any) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.status}</td>
                  <td>{t.due_date ? formatDate(t.due_date) : '-'}</td>
                  <td>{t.assigned_to_user?.name || '-'}</td>
                  <td>{t.client?.name || '-'}</td>
                  <td>{t.company?.name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
    }
  };

  return (
    <div className="rpt-page">
      <div className="rpt-header">
        <h1>Reports</h1>
        <p className="rpt-subtitle">Export filtered data as PDF or Excel</p>
      </div>

      {error && <div className="rpt-alert rpt-alert-error">{error}</div>}

      {/* Tab bar */}
      <div className="rpt-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`rpt-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rpt-filters">
        {renderFilters()}
        <div className="rpt-filter-group rpt-filter-actions">
          <button className="rpt-btn rpt-btn-apply" onClick={handleApplyFilters} disabled={loading}>
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rpt-summary">
        <span>{data.length} record{data.length !== 1 ? 's' : ''} found</span>
        <div className="rpt-export-btns">
          <button
            className="rpt-btn rpt-btn-pdf"
            onClick={() => handleExport('pdf')}
            disabled={exporting || data.length === 0}
          >
            {exporting ? '...' : 'Export PDF'}
          </button>
          <button
            className="rpt-btn rpt-btn-excel"
            onClick={() => handleExport('excel')}
            disabled={exporting || data.length === 0}
          >
            {exporting ? '...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Data table */}
      <div className="rpt-table-wrap">
        {loading ? <div className="rpt-loading">Loading data...</div> : renderTable()}
      </div>
    </div>
  );
};

export default Reports;
