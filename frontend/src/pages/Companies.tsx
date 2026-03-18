import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { Company } from '../types';
import '../styles/CrudPages.css';
import '../styles/Companies.css';

interface EnrichedCompany extends Company {
  lastVisitDate: string | null;
  nextAction: string | null;
  owner: string | null;
  status: 'active' | 'priority' | 'waiting' | 'archived';
}

export const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '', industry: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      try {
        const res = await apiService.getCompanies();
        if (res.success && res.data) setCompanies(res.data);
      } catch (e) { console.warn('[Companies] Failed to load companies:', e); }

      try {
        const res = await apiService.getVisits();
        if (res.success && res.data) setVisits(res.data);
      } catch (e) { /* graceful offline */ }

      try {
        const res = await apiService.getMyTodos();
        if (res.success && res.data) setTodos(Array.isArray(res.data) ? res.data : []);
      } catch (e) { /* graceful offline */ }

      try {
        const res = await apiService.getUsers();
        if (res.success && res.data) setUsers(res.data);
      } catch (e) { /* graceful offline */ }

    } catch (err) {
      setError('Error loading data');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Enrich companies with computed columns ──────
  const enrichedCompanies = useMemo((): EnrichedCompany[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days90ago = new Date(today.getTime() - 90 * 86400000);

    return companies.map(c => {
      // Last visit date + owner
      const companyVisits = visits.filter(v => v.company_id === c.id);
      const lastVisit = companyVisits.length > 0
        ? companyVisits.reduce((latest, v) => {
            const d = new Date(v.visit_date);
            return d > latest.date ? { date: d, visit: v } : latest;
          }, { date: new Date(0), visit: companyVisits[0] })
        : null;

      const lastVisitDate = lastVisit ? lastVisit.date.toISOString() : null;
      const ownerUserId = lastVisit?.visit?.visited_by_user_id || lastVisit?.visit?.user_id;
      const owner = ownerUserId ? (users.find(u => u.id === ownerUserId)?.name || null) : null;

      // Next action: earliest open todo for this company
      const companyTodos = todos.filter(t =>
        t.company_id === c.id && t.status !== 'done' && t.status !== 'completed'
      );
      const nextTodo = companyTodos.length > 0
        ? companyTodos.reduce((earliest, t) => {
            if (!t.due_date) return earliest;
            if (!earliest) return t;
            return new Date(t.due_date) < new Date(earliest.due_date) ? t : earliest;
          }, null as any)
        : null;
      const nextAction = nextTodo?.title || null;

      // Status computation
      let status: EnrichedCompany['status'] = 'archived';
      const hasOverdueTodos = companyTodos.some(t => t.due_date && new Date(t.due_date) < today);

      if (hasOverdueTodos) {
        status = 'priority';
      } else if (lastVisitDate && new Date(lastVisitDate) >= days90ago) {
        status = 'active';
      } else if (lastVisitDate && new Date(lastVisitDate) < days90ago) {
        status = 'waiting';
      }

      return { ...c, lastVisitDate, nextAction, owner, status };
    });
  }, [companies, visits, todos, users]);

  // ─── Filtering ───────────────────────────────────
  const filtered = useMemo(() => {
    return enrichedCompanies.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [enrichedCompanies, search, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateCompany(editingId, formData);
      } else {
        await apiService.createCompany(formData.name, formData.country, formData.industry);
      }
      setFormData({ name: '', country: '', industry: '' });
      setEditingId(null);
      setShowForm(false);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEdit = (company: Company) => {
    setFormData({ name: company.name, country: company.country, industry: company.industry || '' });
    setEditingId(company.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await apiService.deleteCompany(id);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', country: '', industry: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const statusBadge = (status: EnrichedCompany['status']) => {
    const map = {
      active: { label: 'Active', cls: 'badge-green' },
      priority: { label: 'Priority', cls: 'badge-orange' },
      waiting: { label: 'Waiting', cls: 'badge-yellow' },
      archived: { label: 'New', cls: 'badge-gray' },
    };
    const { label, cls } = map[status];
    return <span className={`status-badge ${cls}`}>{label}</span>;
  };

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Companies</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add Company
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-card">
          <h3>{editingId ? 'Edit Company' : 'Add Company'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Company Name *</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Country *</label>
              <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Industry Sector</label>
              <input type="text" value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editingId ? 'Save' : 'Create'}</button>
              <button type="button" onClick={handleCancel} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="companies-filters">
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="companies-search"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="companies-filter-select">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="priority">Priority</option>
          <option value="waiting">Waiting</option>
          <option value="archived">New</option>
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="companies-empty">No companies found</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Country</th>
                <th>Sector</th>
                <th>Status</th>
                <th>Last Visit</th>
                <th>Owner</th>
                <th>Next Action</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id}>
                  <td className="company-name">{company.name}</td>
                  <td>{company.country}</td>
                  <td>{company.industry || '-'}</td>
                  <td>{statusBadge(company.status)}</td>
                  <td className="company-date">
                    {company.lastVisitDate ? new Date(company.lastVisitDate).toLocaleDateString('it-IT') : '-'}
                  </td>
                  <td>{company.owner || '-'}</td>
                  <td className="company-action">{company.nextAction || '-'}</td>
                  <td className="actions">
                    <button onClick={() => handleEdit(company)} className="btn-warning">Edit</button>
                    <button onClick={() => handleDelete(company.id)} className="btn-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
