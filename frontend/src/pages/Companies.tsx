import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company } from '../types';
import '../styles/Companies.css';

const SECTOR_OPTIONS = ['Tiles', 'Slabs', 'Bathroom Furniture'];
const RAPPORTO_OPTIONS = ['AGENZIA', 'PROCACCERIA', 'OCCASIONALE', 'CHIUSO'];

export const Companies: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [companyVisits, setCompanyVisits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '', industry: '', rapporto: '' });
  const [isAddingSector, setIsAddingSector] = useState(false);
  const [newSectorInput, setNewSectorInput] = useState('');
  const [search, setSearch] = useState('');
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openMoreId && moreRef.current && !moreRef.current.contains(e.target as Node)) setOpenMoreId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMoreId]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      try { const r = await apiService.getCompanies(); if (r.success && r.data) setCompanies(r.data); } catch {}
      try { const r = await apiService.getMyTodos(); if (r.success && r.data) setTodos(Array.isArray(r.data) ? r.data : []); } catch {}
      try { const r = await apiService.getCompanyVisits(); if (r.success && r.data) setCompanyVisits(Array.isArray(r.data) ? r.data : []); } catch {}
    } catch { setError('Error loading data'); } finally { setIsLoading(false); }
  };

  // Existing sectors for dropdown
  const sectors = useMemo(() => {
    const fromData = companies.map(c => c.industry).filter(Boolean) as string[];
    return [...new Set([...SECTOR_OPTIONS, ...fromData])].sort();
  }, [companies]);

  // Last visit (company meeting) per company
  const lastVisits = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      const visits = companyVisits.filter((v: any) => v.company_id === c.id);
      if (visits.length > 0) {
        const last = visits.reduce((latest: any, v: any) => {
          if (!latest) return v;
          return new Date(v.date) > new Date(latest.date) ? v : latest;
        }, null);
        if (last) map.set(c.id, new Date(last.date).toLocaleDateString('it-IT'));
      }
    }
    return map;
  }, [companies, companyVisits]);

  const filtered = useMemo(() => {
    let list = [...companies];
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateCompany(editingId, formData);
        setSuccess('Company updated');
      } else {
        await apiService.createCompany(formData.name, formData.country, formData.industry);
        // Update rapporto separately if set
        if (formData.rapporto) {
          const res = await apiService.getCompanies();
          const newCompany = res.data?.find((c: Company) => c.name === formData.name);
          if (newCompany) await apiService.updateCompany(newCompany.id, { rapporto: formData.rapporto });
        }
        setSuccess('Company created');
      }
      resetForm();
      loadData();
    } catch (err) { setError((err as Error).message); }
  };

  const handleEdit = (company: Company) => {
    setOpenMoreId(null);
    setFormData({ name: company.name, country: company.country, industry: company.industry || '', rapporto: company.rapporto || '' });
    setEditingId(company.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setOpenMoreId(null);
    if (!confirm('Delete this company and all associated data?')) return;
    try {
      await apiService.deleteCompany(id);
      setSuccess('Company deleted');
      loadData();
    } catch (err) { setError((err as Error).message); }
  };

  const resetForm = () => {
    setFormData({ name: '', country: '', industry: '', rapporto: '' });
    setEditingId(null);
    setShowForm(false);
    setIsAddingSector(false);
    setNewSectorInput('');
  };

  if (isLoading) return <div className="co-page"><div className="co-loading">Loading companies...</div></div>;

  return (
    <div className="co-page">
      {/* Header */}
      <div className="co-header">
        <div className="co-header-left">
          <h1>Companies</h1>
          <p className="co-header-subtitle">Represented brands and company registry</p>
        </div>
        {isAdmin && (
          <button className="co-btn-new" onClick={() => { resetForm(); setShowForm(true); }}>+ Add Company</button>
        )}
      </div>

      {error && <div className="co-alert co-alert-error">{error}</div>}
      {success && <div className="co-alert co-alert-success">{success}</div>}

      {/* Form */}
      {showForm && isAdmin && (
        <div className="co-form-card">
          <h3>{editingId ? 'Edit Company' : 'Add New Company'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="co-form-row">
              <div className="co-form-group">
                <label>Company Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="co-form-group">
                <label>Country *</label>
                <input type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} required />
              </div>
              <div className="co-form-group">
                <label>Sector</label>
                {isAddingSector ? (
                  <div className="co-sector-add">
                    <input type="text" value={newSectorInput} onChange={e => setNewSectorInput(e.target.value)} placeholder="New sector..." autoFocus />
                    <button type="button" className="co-sector-btn" onClick={() => {
                      if (newSectorInput.trim()) { setFormData({ ...formData, industry: newSectorInput.trim() }); setIsAddingSector(false); setNewSectorInput(''); }
                    }}>OK</button>
                    <button type="button" className="co-sector-btn cancel" onClick={() => { setIsAddingSector(false); setNewSectorInput(''); }}>X</button>
                  </div>
                ) : (
                  <select value={formData.industry} onChange={e => {
                    if (e.target.value === '__add_new__') setIsAddingSector(true);
                    else setFormData({ ...formData, industry: e.target.value });
                  }}>
                    <option value="">Select sector...</option>
                    {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="__add_new__">+ Add new sector...</option>
                  </select>
                )}
              </div>
              {isAdmin && (
                <div className="co-form-group">
                  <label>Rapporto</label>
                  <select value={formData.rapporto} onChange={e => setFormData({ ...formData, rapporto: e.target.value })}>
                    <option value="">Select...</option>
                    {RAPPORTO_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="co-form-actions">
              <button type="submit" className="co-btn-save">{editingId ? 'Save Changes' : 'Create Company'}</button>
              <button type="button" className="co-btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="co-toolbar">
        <input type="text" className="co-search" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="co-table-wrap">
        {filtered.length > 0 && (
          <div className="co-result-count">{filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}</div>
        )}
        {filtered.length === 0 ? (
          <div className="co-empty">
            <div className="co-empty-text">No companies found</div>
            <div className="co-empty-hint">Try changing your search</div>
          </div>
        ) : (
          <div className="co-table-scroll">
            <table className="co-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Sector</th>
                  {isAdmin && <th>Rapporto</th>}
                  <th>Last Visit (Company Meeting)</th>
                  <th style={{ width: '1%' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(company => {
                  const lastVisit = lastVisits.get(company.id);
                  return (
                    <tr key={company.id} onDoubleClick={() => handleEdit(company)} style={{ cursor: 'pointer' }}>
                      <td className="co-name">{company.name}</td>
                      <td>{company.country}</td>
                      <td>{company.industry || <span className="co-muted">-</span>}</td>
                      {isAdmin && (
                        <td>
                          {company.rapporto ? (
                            <span className={`co-rapporto-badge rapporto-${company.rapporto.toLowerCase()}`}>{company.rapporto}</span>
                          ) : <span className="co-muted">-</span>}
                        </td>
                      )}
                      <td className="co-last-visit">{lastVisit || <span className="co-muted">-</span>}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="co-actions">
                          <button className="co-action-btn primary" onClick={() => handleEdit(company)}>View</button>
                          {isAdmin && (
                            <>
                              <button className="co-action-btn" onClick={() => handleEdit(company)}>Edit</button>
                              <button className="co-action-btn danger" onClick={() => handleDelete(company.id)}>Delete</button>
                            </>
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
