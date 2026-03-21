import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, ClientContact, Visit, TodoItem, Company } from '../types';
import { METADATA_SECTION } from '../utils/visitMetadata';
import '../styles/Clients.css';

// ---- Helpers ----
const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  cliente:              { label: 'Client',            className: 'role-client' },
  developer:            { label: 'Developer',         className: 'role-developer' },
  'architetto-designer': { label: 'Architect/Designer', className: 'role-architect' },
};

const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

// ---- Component ----
export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userAreaCompanyIds, setUserAreaCompanyIds] = useState<string[]>([]);
  const [userAreaCountries, setUserAreaCountries] = useState<string[]>([]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '', city: '', notes: '', role: 'cliente' });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [isAddingCountry, setIsAddingCountry] = useState(false);
  const [newCountryInput, setNewCountryInput] = useState('');

  // Contact editing (only in edit mode)
  const EMPTY_CONTACT = { name: '', role: '', email: '', phone: '', wechat: '', notes: '' };
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [pendingBusinessCard, setPendingBusinessCard] = useState<File | null>(null);
  const [editContacts, setEditContacts] = useState<ClientContact[]>([]);

  // Filters
  const [localSearch, setLocalSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openMoreId && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setOpenMoreId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMoreId]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  // ---- Load data ----
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) setClients(r.data);
      } catch {}
      try {
        const r = await apiService.getVisits();
        if (r.success && r.data) setVisits(r.data);
      } catch {}
      try {
        const r = await apiService.getTodos();
        if (r.success) setTodos(Array.isArray(r.data) ? r.data : []);
      } catch {}
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}
      // Load user areas (for non-admin: filter companies and add countries)
      if (!isAdmin) {
        try {
          const r = await apiService.getMyAreas();
          if (r.success && r.data) {
            setUserAreaCompanyIds(r.data.companies?.map((c: any) => c.id) || []);
            setUserAreaCountries(r.data.countries || []);
          }
        } catch {}
      }
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  // ---- Lookups ----
  const getCompanyName = useCallback((id: string) => companies.find(c => c.id === id)?.name || '-', [companies]);

  // Per-client enrichment
  const clientEnrichment = useMemo(() => {
    const map = new Map<string, { lastVisit: string | null; openFollowups: number; relatedCompanies: string[] }>();

    for (const client of clients) {
      const clientVisits = visits.filter(v => v.client_id === client.id);
      const sortedVisits = clientVisits.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
      const lastVisit = sortedVisits[0]?.visit_date || null;

      const openFollowups = todos.filter(t =>
        t.client_id === client.id && t.status !== 'done' && t.status !== 'completed'
      ).length;

      // Companies from visit reports
      const companyIds = new Set<string>();
      for (const v of clientVisits) {
        if (v.reports) {
          for (const r of v.reports) {
            if (r.section !== METADATA_SECTION && r.company_id) {
              companyIds.add(r.company_id);
            }
          }
        }
      }
      const relatedCompanies = [...companyIds].map(id => getCompanyName(id)).filter(n => n !== '-');

      map.set(client.id, { lastVisit, openFollowups, relatedCompanies });
    }
    return map;
  }, [clients, visits, todos, getCompanyName]);

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const total = clients.length;
    const withContacts = clients.filter(c => (c.contacts?.length || 0) > 0).length;
    const cutoff60 = new Date();
    cutoff60.setDate(cutoff60.getDate() - 60);

    let notVisited = 0;
    let withOpenFollowups = 0;
    for (const c of clients) {
      const e = clientEnrichment.get(c.id);
      if (!e?.lastVisit || new Date(e.lastVisit) < cutoff60) notVisited++;
      if (e && e.openFollowups > 0) withOpenFollowups++;
    }

    return { total, withContacts, notVisited, withOpenFollowups };
  }, [clients, clientEnrichment]);

  // ---- Countries for filter and form ----
  const countries = useMemo(() => {
    const countrySet = new Set(clients.map(c => c.country).filter(Boolean));
    // Include user's area countries (so they can create clients in their assigned countries even if no clients exist yet)
    for (const c of userAreaCountries) countrySet.add(c);
    // Also include formData.country if it's set but not in the list (for new countries being added)
    if (formData.country && !countrySet.has(formData.country)) {
      countrySet.add(formData.country);
    }
    return Array.from(countrySet).sort();
  }, [clients, userAreaCountries, formData.country]);

  // ---- Companies filtered for form (non-admin sees only their area companies) ----
  const formCompanies = useMemo(() => {
    if (isAdmin) return companies;
    if (userAreaCompanyIds.length === 0) return companies; // fallback
    return companies.filter(c => userAreaCompanyIds.includes(c.id));
  }, [companies, userAreaCompanyIds, isAdmin]);

  // ---- Visible clients ----
  const visibleClients = useMemo(() => {
    let list = [...clients];

    if (countryFilter) list = list.filter(c => c.country === countryFilter);
    if (roleFilter) list = list.filter(c => (c as any).role === roleFilter);

    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      list = list.filter(c => {
        const name = c.name.toLowerCase();
        const country = (c.country || '').toLowerCase();
        const contactNames = (c.contacts || []).map(ct => ct.name.toLowerCase()).join(' ');
        return name.includes(q) || country.includes(q) || contactNames.includes(q);
      });
    }

    // Sort by role then name
    const roleOrder: Record<string, number> = { cliente: 0, developer: 1, 'architetto-designer': 2 };
    list.sort((a, b) => {
      const ra = roleOrder[(a as any).role || 'cliente'] ?? 99;
      const rb = roleOrder[(b as any).role || 'cliente'] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [clients, countryFilter, roleFilter, localSearch]);

  // ---- Form handlers ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiService.updateClient(editingId, { ...formData, company_ids: selectedCompanyIds });
        setSuccess('Client updated');
      } else {
        await apiService.createClient(formData.name, formData.country, formData.notes, formData.role, selectedCompanyIds, formData.city);
        setSuccess('Client created');
      }
      resetForm();
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEdit = (client: Client) => {
    setOpenMoreId(null);
    setFormData({ name: client.name, country: client.country, city: client.city || '', notes: client.notes || '', role: (client as any).role || 'cliente' });
    setSelectedCompanyIds((client as any).clientCompanies?.map((cc: any) => cc.company_id || cc.company?.id) || []);
    setEditContacts(client.contacts || []);
    setEditingId(client.id);
    setShowForm(true);
  };

  const handleDelete = (client: Client) => {
    setOpenMoreId(null);
    setDeleteConfirm(client);
    setDeleteChecked(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || !deleteChecked) return;
    try {
      await apiService.deleteClient(deleteConfirm.id);
      setSuccess('Client deleted');
      setDeleteConfirm(null);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', country: '', city: '', notes: '', role: 'cliente' });
    setSelectedCompanyIds([]);
    setEditContacts([]);
    setShowContactForm(false);
    setEditingContactId(null);
    setContactForm(EMPTY_CONTACT);
    setEditingId(null);
    setShowForm(false);
  };

  // Contact handlers (edit mode only)
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !contactForm.name.trim()) return;
    try {
      if (editingContactId) {
        await apiService.updateClientContact(editingContactId, contactForm);
        setSuccess('Contact updated');
      } else {
        await apiService.addClientContact(editingId, contactForm);
        setSuccess('Contact added');
      }
      // If new contact and has pending business card, upload it
      if (!editingContactId && pendingBusinessCard) {
        // Reload to get the new contact ID
        const reloadRes = await apiService.getClient(editingId);
        if (reloadRes.success && reloadRes.data) {
          const newContacts = reloadRes.data.contacts || [];
          const newContact = newContacts.find((c: any) => c.name === contactForm.name.trim());
          if (newContact) {
            await apiService.uploadBusinessCard(editingId, newContact.id, pendingBusinessCard);
          }
        }
      }
      setContactForm(EMPTY_CONTACT);
      setPendingBusinessCard(null);
      setEditingContactId(null);
      setShowContactForm(false);
      const r = await apiService.getClient(editingId);
      if (r.success && r.data) setEditContacts(r.data.contacts || []);
      loadData();
    } catch (err) { setError((err as Error).message); }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await apiService.deleteClientContact(contactId);
      setEditContacts(prev => prev.filter(c => c.id !== contactId));
      setSuccess('Contact deleted');
      loadData();
    } catch (err) { setError((err as Error).message); }
  };

  const handleBusinessCardUpload = async (contactId: string, file: File) => {
    if (!editingId) return;
    try {
      await apiService.uploadBusinessCard(editingId, contactId, file);
      const r = await apiService.getClient(editingId);
      if (r.success && r.data) setEditContacts(r.data.contacts || []);
      setSuccess('Business card uploaded');
    } catch { setError('Error uploading business card'); }
  };

  // ---- Render ----
  if (loading) {
    return <div className="clients-page"><div className="clients-loading">Loading clients...</div></div>;
  }

  return (
    <div className="clients-page">
      {/* Header */}
      <div className="clients-header">
        <div className="clients-header-left">
          <h1>Clients</h1>
          <p className="clients-header-subtitle">Manage your client portfolio and contacts</p>
        </div>
        <button className="clients-btn-new" onClick={() => { resetForm(); setShowForm(true); }}>
          + Add Client
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="clients-alert clients-alert-error">{error}</div>}
      {success && <div className="clients-alert clients-alert-success">{success}</div>}

      {/* Form */}
      {showForm && (
        <div className="clients-form-card">
          <h3>{editingId ? 'Edit Client' : 'Add New Client'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="clients-form-row">
              <div className="clients-form-group">
                <label>Client Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="clients-form-group">
                <label>Country *</label>
                {isAddingCountry ? (
                  <div className="clients-country-add">
                    <input
                      type="text"
                      value={newCountryInput}
                      onChange={e => setNewCountryInput(e.target.value)}
                      placeholder="New country name..."
                      autoFocus
                    />
                    <button type="button" className="clients-country-btn" onClick={() => {
                      if (newCountryInput.trim()) {
                        setFormData({ ...formData, country: newCountryInput.trim() });
                        setIsAddingCountry(false);
                        setNewCountryInput('');
                      }
                    }}>OK</button>
                    <button type="button" className="clients-country-btn cancel" onClick={() => { setIsAddingCountry(false); setNewCountryInput(''); }}>X</button>
                  </div>
                ) : (
                  <select
                    value={formData.country}
                    onChange={e => {
                      if (e.target.value === '__add_new__') {
                        setIsAddingCountry(true);
                      } else {
                        setFormData({ ...formData, country: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select country...</option>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__add_new__">+ Add new country...</option>
                  </select>
                )}
              </div>
              <div className="clients-form-group">
                <label>City</label>
                <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="City..." />
              </div>
              <div className="clients-form-group">
                <label>Type</label>
                <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                  <option value="cliente">Client</option>
                  <option value="developer">Developer</option>
                  <option value="architetto-designer">Architect/Designer</option>
                </select>
              </div>
            </div>
            <div className="clients-form-group">
              <label>Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} />
            </div>
            {/* Company checkboxes (suppliers) */}
            <div className="clients-form-group">
              <label>Suppliers / Companies</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '0.5rem',
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: 'var(--color-bg-primary)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}>
                {formCompanies.map(company => {
                  const isSelected = selectedCompanyIds.includes(company.id);
                  return (
                    <label key={company.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.875rem',
                      fontWeight: isSelected ? 600 : 400,
                      border: isSelected ? '1.5px solid rgba(74, 96, 120, 0.4)' : '1.5px solid transparent',
                      background: isSelected ? 'rgba(74, 96, 120, 0.08)' : 'var(--color-white)',
                      color: isSelected ? 'var(--color-info)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 1px 3px rgba(74, 96, 120, 0.1)' : 'none',
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCompanyIds(prev => [...prev, company.id]);
                          } else {
                            setSelectedCompanyIds(prev => prev.filter(id => id !== company.id));
                          }
                        }}
                        style={{ margin: 0, width: '16px', height: '16px', accentColor: '#4A6078', flexShrink: 0 }}
                      />
                      {company.name}
                    </label>
                  );
                })}
              </div>
              {selectedCompanyIds.length > 0 && (
                <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                  {formCompanies.filter(c => selectedCompanyIds.includes(c.id)).length} supplier{formCompanies.filter(c => selectedCompanyIds.includes(c.id)).length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
            <div className="clients-form-actions">
              <button type="submit" className="clients-btn-save">{editingId ? 'Save Changes' : 'Create Client'}</button>
              <button type="button" className="clients-btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>

          {/* Contacts section (only in edit mode) */}
          {editingId && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.938rem' }}>Contacts ({editContacts.length})</h4>
                <button type="button" className="clients-btn-new" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                  onClick={() => { setContactForm(EMPTY_CONTACT); setEditingContactId(null); setShowContactForm(true); }}>
                  + Add Contact
                </button>
              </div>

              {showContactForm && (
                <form onSubmit={handleContactSubmit} style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div className="clients-form-group"><label>Name *</label><input type="text" value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} required /></div>
                    <div className="clients-form-group"><label>Role / Title</label><input type="text" value={contactForm.role} onChange={e => setContactForm({...contactForm, role: e.target.value})} placeholder="e.g. Sales Manager" /></div>
                    <div className="clients-form-group"><label>Email</label><input type="email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} /></div>
                    <div className="clients-form-group"><label>Phone</label><input type="tel" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} /></div>
                    <div className="clients-form-group"><label>WeChat</label><input type="text" value={contactForm.wechat} onChange={e => setContactForm({...contactForm, wechat: e.target.value})} /></div>
                    <div className="clients-form-group"><label>Notes</label><input type="text" value={contactForm.notes} onChange={e => setContactForm({...contactForm, notes: e.target.value})} /></div>
                  </div>
                  {!editingContactId && (
                    <div className="clients-form-group" style={{ marginTop: '0.5rem' }}>
                      <label>Business Card (PDF or image)</label>
                      <input type="file" accept="image/*,.pdf"
                        onChange={e => setPendingBusinessCard(e.target.files?.[0] || null)}
                        style={{ fontSize: '0.813rem' }}
                      />
                      {pendingBusinessCard && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-info)', marginTop: '0.25rem' }}>
                          📎 {pendingBusinessCard.name}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="submit" className="clients-btn-save" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>{editingContactId ? 'Save' : 'Add'}</button>
                    <button type="button" className="clients-btn-cancel" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                      onClick={() => { setShowContactForm(false); setEditingContactId(null); setContactForm(EMPTY_CONTACT); }}>Cancel</button>
                  </div>
                </form>
              )}

              {editContacts.map(contact => (
                <div key={contact.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0.75rem', marginBottom: '0.375rem',
                  background: 'var(--color-white)', border: '1px solid var(--color-border)', borderRadius: '6px',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{contact.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                      {[contact.role, contact.email, contact.phone].filter(Boolean).join(' · ') || 'No details'}
                    </div>
                    {(contact as any).business_card_filename && (
                      <div style={{ fontSize: '0.688rem', color: 'var(--color-info)', marginTop: '0.125rem' }}>
                        📎 {(contact as any).business_card_filename}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0, alignItems: 'center' }}>
                    <label style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-info)', padding: '0.2rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      📎 Business Card
                      <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) handleBusinessCardUpload(contact.id, e.target.files[0]); e.target.value = ''; }} />
                    </label>
                    <button type="button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-white)', cursor: 'pointer' }}
                      onClick={() => { setEditingContactId(contact.id); setContactForm({ name: contact.name || '', role: contact.role || '', email: contact.email || '', phone: contact.phone || '', wechat: contact.wechat || '', notes: contact.notes || '' }); setShowContactForm(true); }}>
                      Edit
                    </button>
                    <button type="button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(158,90,82,0.2)', borderRadius: '4px', background: 'var(--color-white)', color: '#9E5A52', cursor: 'pointer' }}
                      onClick={() => handleDeleteContact(contact.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="clients-kpi-row">
        <div className="clients-kpi">
          <div className="clients-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div className="clients-kpi-body">
            <div className="clients-kpi-value">{kpis.total}</div>
            <div className="clients-kpi-label">Total Clients</div>
          </div>
        </div>
        <div className="clients-kpi">
          <div className="clients-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>
          </div>
          <div className="clients-kpi-body">
            <div className="clients-kpi-value">{kpis.withContacts}</div>
            <div className="clients-kpi-label">With Contacts</div>
          </div>
        </div>
        <div className="clients-kpi">
          <div className="clients-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
          </div>
          <div className="clients-kpi-body">
            <div className={`clients-kpi-value${kpis.notVisited > 0 ? ' alert' : ''}`}>{kpis.notVisited}</div>
            <div className="clients-kpi-label">Not Visited (60d)</div>
          </div>
        </div>
        <div className="clients-kpi">
          <div className="clients-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          </div>
          <div className="clients-kpi-body">
            <div className={`clients-kpi-value${kpis.withOpenFollowups > 0 ? ' alert' : ''}`}>{kpis.withOpenFollowups}</div>
            <div className="clients-kpi-label">Open Follow-ups</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="clients-toolbar">
        <div className="clients-filters-row">
          <input
            type="text"
            className="clients-search-input"
            placeholder="Search clients..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
          <select
            className={`clients-filter-select${countryFilter ? ' active' : ''}`}
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className={`clients-filter-select${roleFilter ? ' active' : ''}`}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="cliente">Client</option>
            <option value="developer">Developer</option>
            <option value="architetto-designer">Architect/Designer</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="clients-table-wrap">
        {visibleClients.length > 0 && (
          <div className="clients-result-count">
            {visibleClients.length} client{visibleClients.length !== 1 ? 's' : ''}
          </div>
        )}

        {visibleClients.length === 0 ? (
          <div className="clients-empty">
            <div className="clients-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <div className="clients-empty-text">No clients found</div>
            <div className="clients-empty-hint">Try changing filters or add a new client</div>
          </div>
        ) : (
          <div className="clients-table-scroll">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Country</th>
                  <th>City</th>
                  <th>Type</th>
                  <th>Companies</th>
                  <th>Last Visit</th>
                  <th>Follow-ups</th>
                  <th>Contacts</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleClients.map(client => {
                  const role = (client as any).role || 'cliente';
                  const roleConf = ROLE_CONFIG[role] || ROLE_CONFIG.cliente;
                  const enrichment = clientEnrichment.get(client.id);
                  const contactCount = client.contacts?.length || 0;

                  return (
                    <tr key={client.id}>
                      {/* Client name */}
                      <td className="client-name-cell">
                        <div className="client-name">{client.name}</div>
                        {client.notes && <div className="client-notes">{client.notes}</div>}
                      </td>

                      {/* Country */}
                      <td><span className="client-country">{client.country}</span></td>

                      {/* City */}
                      <td>{client.city || <span className="client-muted">-</span>}</td>

                      {/* Role badge */}
                      <td>
                        <span className={`client-role-badge ${roleConf.className}`}>
                          {roleConf.label}
                        </span>
                      </td>

                      {/* Suppliers (from clientCompanies, filtered for non-admin) */}
                      <td>
                        {(() => {
                          const allCc = (client as any).clientCompanies || [];
                          const filtered = isAdmin ? allCc : allCc.filter((cc: any) => userAreaCompanyIds.includes(cc.company_id));
                          return filtered.length > 0 ? (
                            <div className="client-companies">
                              {filtered.map((cc: any) => cc.company?.name || getCompanyName(cc.company_id)).join(', ')}
                            </div>
                          ) : (
                            <span className="client-muted">-</span>
                          );
                        })()}
                      </td>

                      {/* Last Visit */}
                      <td>
                        {enrichment?.lastVisit ? (
                          <span className={`client-last-visit${daysSince(enrichment.lastVisit) > 60 ? ' overdue' : ''}`}>
                            {formatDate(enrichment.lastVisit)}
                          </span>
                        ) : (
                          <span className="client-muted">Never</span>
                        )}
                      </td>

                      {/* Follow-ups */}
                      <td>
                        {enrichment && enrichment.openFollowups > 0 ? (
                          <span className="client-followup-badge clickable" onClick={() => navigate('/tasks')}>{enrichment.openFollowups} open</span>
                        ) : (
                          <span className="client-muted">-</span>
                        )}
                      </td>

                      {/* Contacts */}
                      <td>
                        <span className={`client-contacts-badge${contactCount > 0 ? ' has' : ''}`}>
                          {contactCount} contact{contactCount !== 1 ? 's' : ''}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="client-actions">
                          <button
                            className="client-action-btn primary"
                            onClick={() => navigate(`/clients/${client.id}`)}
                          >
                            View
                          </button>
                          <button
                            className="client-action-btn"
                            onClick={() => handleEdit(client)}
                          >
                            Edit
                          </button>
                          <div
                            className="client-more-wrap"
                            ref={openMoreId === client.id ? moreRef : undefined}
                          >
                            <button
                              className="client-more-btn"
                              onClick={() => setOpenMoreId(openMoreId === client.id ? null : client.id)}
                            >
                              &#x22EE;
                            </button>
                            {openMoreId === client.id && (
                              <div className="client-more-menu">
                                <button
                                  className="client-more-item"
                                  onClick={() => { setOpenMoreId(null); navigate(`/visits/new`); }}
                                >
                                  Register Visit
                                </button>
                                {isAdmin && (
                                  <>
                                    <div className="client-more-divider" />
                                    <button
                                      className="client-more-item danger"
                                      onClick={() => handleDelete(client)}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
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
      {deleteConfirm && (
        <div className="clients-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="clients-modal" onClick={e => e.stopPropagation()}>
            <h2>Delete Client</h2>
            <p>This will delete <strong>{deleteConfirm.name}</strong> and all associated visits. This cannot be undone.</p>
            <label className="clients-modal-check">
              <input type="checkbox" checked={deleteChecked} onChange={e => setDeleteChecked(e.target.checked)} />
              I confirm I want to delete this client
            </label>
            <div className="clients-modal-actions">
              <button className="clients-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="clients-btn-danger" onClick={confirmDelete} disabled={!deleteChecked}>Delete Client</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
