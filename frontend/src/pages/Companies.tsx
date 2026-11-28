import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company } from '../types';
import '../styles/Companies.css';

const SECTOR_OPTIONS = ['Tiles', 'Slabs', 'Bathroom Furniture'];
const RAPPORTO_OPTIONS = ['AGENZIA', 'PROCACCERIA', 'OCCASIONALE', 'CHIUSO'];

/** A checkbox for each company, to choose some of them. */
const CompanyChecks: React.FC<{
  companies: Company[]; exclude: string | null; selected: string[]; onChange: (ids: string[]) => void;
}> = ({ companies, exclude, selected, onChange }) => (
  <div className="co-group-list">
    {[...companies].filter(c => c.id !== exclude).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
      <label key={c.id} className="co-group-item">
        <input
          type="checkbox"
          checked={selected.includes(c.id)}
          onChange={() => onChange(selected.includes(c.id) ? selected.filter(x => x !== c.id) : [...selected, c.id])}
        />
        {c.name}
      </label>
    ))}
  </div>
);

export const Companies: React.FC = () => {
  const navigate = useNavigate();
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
  const [formData, setFormData] = useState({ name: '', country: '', industry: '', rapporto: '', group_members: [] as string[], price_list_sources: [] as string[] });
  const [isAddingSector, setIsAddingSector] = useState(false);
  const [newSectorInput, setNewSectorInput] = useState('');
  const [search, setSearch] = useSessionState('companies__search', '');
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);
  const [merge, setMerge] = useState<{ id: string; targetId: string; usage: { label: string }[] | null; busy: boolean } | null>(null);
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

  useScrollRestore('companies', !isLoading);

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

  // Rows of the table: each group (e.g. "Gruppo ABK") is followed by its
  // companies, indented; the other companies are listed normally
  const rows = useMemo(() => {
    const byName = (a: Company, b: Company) => a.name.localeCompare(b.name);
    const byId = new Map(companies.map(c => [c.id, c]));
    const matches = (c: Company) => !search || c.name.toLowerCase().includes(search.toLowerCase());
    const groups = companies.filter(c => (c.group_members || []).some(id => byId.has(id) && id !== c.id)).sort(byName);
    const isGroup = new Set(groups.map(g => g.id));
    const memberOf = new Map<string, string>();
    for (const g of groups) {
      for (const id of g.group_members || []) {
        if (!memberOf.has(id) && byId.has(id) && id !== g.id && !isGroup.has(id)) memberOf.set(id, g.id);
      }
    }
    const out: { company: Company; kind: 'group' | 'member' | 'plain'; count?: number }[] = [];
    for (const c of [...companies].sort(byName)) {
      if (isGroup.has(c.id)) {
        const members = (c.group_members || []).filter(id => memberOf.get(id) === c.id).map(id => byId.get(id)!).sort(byName);
        const shown = matches(c) ? members : members.filter(matches);
        if (!matches(c) && !shown.length) continue;
        out.push({ company: c, kind: 'group', count: members.length });
        shown.forEach(m => out.push({ company: m, kind: 'member' }));
      } else if (!memberOf.has(c.id) && matches(c)) {
        out.push({ company: c, kind: 'plain' });
      }
    }
    return out;
  }, [companies, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateCompany(editingId, { ...formData, group_members: formData.group_members.length ? formData.group_members : null } as any);
        setSuccess('Company updated');
      } else {
        await apiService.createCompany(formData.name, formData.country, formData.industry);
        // Update rapporto and group separately if set
        if (formData.rapporto || formData.group_members.length || formData.price_list_sources.length) {
          const res = await apiService.getCompanies();
          const newCompany = res.data?.find((c: Company) => c.name === formData.name);
          if (newCompany) {
            await apiService.updateCompany(newCompany.id, {
              rapporto: formData.rapporto || undefined,
              group_members: formData.group_members.length ? formData.group_members : null,
              price_list_sources: formData.price_list_sources,
            } as any);
          }
        }
        setSuccess('Company created');
      }
      resetForm();
      loadData();
    } catch (err) { setError((err as Error).message); }
  };

  const handleEdit = (company: Company) => {
    setOpenMoreId(null);
    setFormData({
      name: company.name, country: company.country, industry: company.industry || '', rapporto: company.rapporto || '',
      group_members: company.group_members || [],
      price_list_sources: company.price_list_sources || [],
    });
    setEditingId(company.id);
    setShowForm(true);
  };

  const apiError = (err: any) => err?.response?.data?.error || (err as Error).message;

  const handleDelete = async (id: string) => {
    setOpenMoreId(null);
    setError('');
    const name = companies.find(c => c.id === id)?.name || 'this company';
    if (!confirm(`Eliminare ${name}?`)) return;
    try {
      await apiService.deleteCompany(id);
      setSuccess(`${name} eliminata`);
      loadData();
    } catch (err) {
      setError(apiError(err));
      // still used somewhere: offer to merge it into another company
      if ((err as any)?.response?.status === 409) openMerge(id);
    }
  };

  const openMerge = async (id: string) => {
    setOpenMoreId(null);
    setMerge({ id, targetId: '', usage: null, busy: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const r = await apiService.getCompanyUsage(id);
      setMerge(m => (m && m.id === id ? { ...m, usage: r.data || [] } : m));
    } catch { setMerge(m => (m && m.id === id ? { ...m, usage: [] } : m)); }
  };

  const handleMerge = async () => {
    if (!merge?.targetId) return;
    const source = companies.find(c => c.id === merge.id);
    const target = companies.find(c => c.id === merge.targetId);
    if (!confirm(`Spostare tutto di ${source?.name} su ${target?.name} ed eliminare ${source?.name}?`)) return;
    setMerge({ ...merge, busy: true });
    try {
      await apiService.mergeCompany(merge.id, merge.targetId);
      setError('');
      setSuccess(`${source?.name} unita a ${target?.name}`);
      setMerge(null);
      loadData();
    } catch (err) {
      setError(apiError(err));
      setMerge(m => (m ? { ...m, busy: false } : m));
    }
  };

  const resetForm = () => {
    setFormData({ name: '', country: '', industry: '', rapporto: '', group_members: [], price_list_sources: [] });
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
            {isAdmin && (
              <div className="co-form-group co-group">
                <label>Gruppo per le statistiche</label>
                <p className="co-group-hint">
                  Solo se questa voce è un gruppo che serve per le statistiche (per esempio "Gruppo ABK"): spunta le aziende
                  che ne fanno parte. Scegliendo il gruppo in fatturato, provvigioni e articoli vedrai i dati di tutte
                  queste aziende insieme. Non cambia i listini.
                </p>
                <CompanyChecks companies={companies} exclude={editingId} selected={formData.group_members}
                  onChange={ids => setFormData(f => ({ ...f, group_members: ids }))} />
              </div>
            )}
            {isAdmin && (
              <div className="co-form-group co-group">
                <label>Usa anche i listini di</label>
                <p className="co-group-hint">
                  Se questa azienda fattura articoli di altre aziende (per esempio ABK Group, che vende i prodotti di Abk,
                  Flaviker, Versace...), spunta le aziende di cui usare i listini. Le righe delle sue fatture verranno
                  abbinate anche agli articoli di quei listini.
                </p>
                <CompanyChecks companies={companies} exclude={editingId} selected={formData.price_list_sources}
                  onChange={ids => setFormData(f => ({ ...f, price_list_sources: ids }))} />
              </div>
            )}
            <div className="co-form-actions">
              <button type="submit" className="co-btn-save">{editingId ? 'Save Changes' : 'Create Company'}</button>
              <button type="button" className="co-btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Merge a duplicate into another company */}
      {merge && isAdmin && (() => {
        const source = companies.find(c => c.id === merge.id);
        if (!source) return null;
        const lower = source.name.trim().toLowerCase();
        const others = companies.filter(c => c.id !== merge.id).sort((a, b) => {
          const sa = a.name.trim().toLowerCase() === lower ? 0 : 1;
          const sb = b.name.trim().toLowerCase() === lower ? 0 : 1;
          return sa - sb || a.name.localeCompare(b.name);
        });
        return (
          <div className="co-form-card">
            <h3>Unisci {source.name} a…</h3>
            <p className="co-group-hint">
              Visite, report, fatture, offerte, articoli e ogni altro collegamento di <strong>{source.name}</strong> vengono
              spostati sull'azienda che scegli, poi <strong>{source.name}</strong> viene eliminata.
            </p>
            <p className="co-group-hint">
              {merge.usage === null ? 'Controllo cosa usa questa azienda…'
                : merge.usage.length ? `Da spostare: ${merge.usage.map(u => u.label).join(', ')}.`
                : 'Non è usata da nessuna parte: puoi anche semplicemente eliminarla.'}
            </p>
            <div className="co-form-row">
              <div className="co-form-group">
                <label>Azienda da tenere</label>
                <select value={merge.targetId} onChange={e => setMerge({ ...merge, targetId: e.target.value })}>
                  <option value="">Scegli…</option>
                  {others.map(c => <option key={c.id} value={c.id}>{c.name}{c.country ? ` (${c.country})` : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="co-form-actions">
              <button type="button" className="co-btn-save" disabled={!merge.targetId || merge.busy} onClick={handleMerge}>
                {merge.busy ? 'Unisco…' : 'Unisci ed elimina'}
              </button>
              <button type="button" className="co-btn-cancel" onClick={() => setMerge(null)}>Annulla</button>
            </div>
          </div>
        );
      })()}

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
                {rows.map(({ company, kind, count }) => {
                  const lastVisit = lastVisits.get(company.id);
                  return (
                    <tr
                      key={company.id}
                      className={kind === 'group' ? 'co-row-group' : kind === 'member' ? 'co-row-member' : undefined}
                      onDoubleClick={() => navigate(`/companies/${company.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="co-name">
                        {kind === 'member' && <span className="co-member-mark" aria-hidden="true">└</span>}
                        {company.name}
                        {kind === 'group' && <span className="co-group-badge">Gruppo · {count} aziende</span>}
                      </td>
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
                          <button className="co-action-btn primary" onClick={() => navigate(`/companies/${company.id}`)}>View</button>
                          {isAdmin && (
                            <>
                              <button className="co-action-btn" onClick={() => handleEdit(company)}>Edit</button>
                              <button className="co-action-btn" onClick={() => openMerge(company.id)}>Unisci a…</button>
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
