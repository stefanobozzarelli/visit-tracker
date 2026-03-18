import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Client, ClientContact, Visit, TodoItem, Company } from '../types';
import { METADATA_SECTION } from '../utils/visitMetadata';
import '../styles/ClientDetail.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');
const EMPTY_CONTACT = { name: '', role: '', email: '', phone: '', wechat: '', notes: '' };

export const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [deleteContactConfirm, setDeleteContactConfirm] = useState<ClientContact | null>(null);

  useEffect(() => { loadData(); }, [id]);
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      try { const r = await apiService.getClient(id); if (r.success && r.data) setClient(r.data); } catch {}
      try { const r = await apiService.getVisits({ client_id: id }); if (r.success && r.data) setVisits(r.data); } catch {}
      try { const r = await apiService.getTodos({ clientId: id }); if (r.success) setTodos(Array.isArray(r.data) ? r.data : []); } catch {}
      try { const r = await apiService.getCompanies(); if (r.success && r.data) setCompanies(r.data); } catch {}
    } finally { setLoading(false); }
  };

  const getCompanyName = (cid: string) => companies.find(c => c.id === cid)?.name || '-';

  const clientVisits = useMemo(() => {
    return [...visits].filter(v => v.client_id === id)
      .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()).slice(0, 5);
  }, [visits, id]);

  const openTodos = useMemo(() => {
    return todos.filter(t => t.client_id === id && t.status !== 'done' && t.status !== 'completed');
  }, [todos, id]);

  const relatedCompanies = useMemo(() => {
    const ids = new Set<string>();
    for (const v of visits.filter(v => v.client_id === id)) {
      for (const r of (v.reports || [])) {
        if (r.section !== METADATA_SECTION && r.company_id) ids.add(r.company_id);
      }
    }
    return [...ids].map(cid => getCompanyName(cid)).filter(n => n !== '-');
  }, [visits, id, companies]);

  // ---- Contact handlers ----
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !contactForm.name.trim()) return;
    setError('');
    try {
      if (editingContactId) {
        await apiService.updateClientContact(editingContactId, contactForm);
        setSuccess('Contact updated');
      } else {
        await apiService.addClientContact(id, contactForm);
        setSuccess('Contact added');
      }
      resetContactForm();
      loadData();
    } catch (err) { setError((err as Error).message || 'Error saving contact'); }
  };

  const handleEditContact = (contact: ClientContact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || '', role: contact.role || '', email: contact.email || '',
      phone: contact.phone || '', wechat: contact.wechat || '', notes: contact.notes || '',
    });
    setShowContactForm(true);
  };

  const handleDeleteContact = async () => {
    if (!deleteContactConfirm) return;
    try {
      await apiService.deleteClientContact(deleteContactConfirm.id);
      setSuccess('Contact deleted');
      setDeleteContactConfirm(null);
      loadData();
    } catch (err) { setError((err as Error).message || 'Error deleting contact'); }
  };

  const resetContactForm = () => {
    setContactForm(EMPTY_CONTACT);
    setEditingContactId(null);
    setShowContactForm(false);
  };

  if (loading) return <div className="cd-page"><div className="cd-loading">Loading...</div></div>;
  if (!client) return <div className="cd-page"><div className="cd-loading">Client not found</div></div>;

  const role = (client as any).role || 'cliente';
  const roleLabels: Record<string, string> = { cliente: 'Client', developer: 'Developer', 'architetto-designer': 'Architect/Designer' };
  const contacts = client.contacts || [];

  return (
    <div className="cd-page">
      {/* Header */}
      <div className="cd-header">
        <div className="cd-header-left">
          <button className="cd-back" onClick={() => navigate('/contacts')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back to Clients
          </button>
          <h1>{client.name}</h1>
          <div className="cd-header-meta">
            <span className="cd-header-country">{client.country}</span>
            <span className={`cd-role-badge role-${role === 'architetto-designer' ? 'architect' : role === 'developer' ? 'developer' : 'client'}`}>
              {roleLabels[role] || 'Client'}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="cd-alert cd-alert-error">{error}</div>}
      {success && <div className="cd-alert cd-alert-success">{success}</div>}

      {/* Info cards row */}
      <div className="cd-info-row">
        <div className="cd-info-card">
          <div className="cd-info-label">Companies</div>
          <div className="cd-info-value">{relatedCompanies.length > 0 ? relatedCompanies.join(', ') : 'None yet'}</div>
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Last Visit</div>
          <div className="cd-info-value">{clientVisits[0] ? formatDate(clientVisits[0].visit_date) : 'Never'}</div>
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Open Follow-ups</div>
          <div className={`cd-info-value${openTodos.length > 0 ? ' alert' : ''}`}>{openTodos.length}</div>
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Contacts</div>
          <div className="cd-info-value">{contacts.length}</div>
        </div>
      </div>

      {client.notes && (
        <div className="cd-notes-card">
          <div className="cd-notes-label">Notes</div>
          <div className="cd-notes-text">{client.notes}</div>
        </div>
      )}

      {/* Two columns: Contacts + Recent Visits */}
      <div className="cd-columns">
        {/* Contacts section */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Contacts ({contacts.length})</h3>
            <button className="cd-btn-add" onClick={() => { resetContactForm(); setShowContactForm(true); }}>+ Add Contact</button>
          </div>

          {showContactForm && (
            <div className="cd-contact-form">
              <form onSubmit={handleContactSubmit}>
                <div className="cd-form-grid">
                  <div className="cd-form-group"><label>Name *</label><input type="text" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} required /></div>
                  <div className="cd-form-group"><label>Role / Title</label><input type="text" value={contactForm.role} onChange={e => setContactForm({ ...contactForm, role: e.target.value })} placeholder="e.g. Sales Manager" /></div>
                  <div className="cd-form-group"><label>Email</label><input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                  <div className="cd-form-group"><label>Phone</label><input type="tel" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
                  <div className="cd-form-group"><label>WeChat</label><input type="text" value={contactForm.wechat} onChange={e => setContactForm({ ...contactForm, wechat: e.target.value })} /></div>
                  <div className="cd-form-group"><label>Notes</label><input type="text" value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} /></div>
                </div>
                <div className="cd-form-actions">
                  <button type="submit" className="cd-btn-save">{editingContactId ? 'Save' : 'Add Contact'}</button>
                  <button type="button" className="cd-btn-cancel" onClick={resetContactForm}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {contacts.length === 0 && !showContactForm ? (
            <div className="cd-empty">No contacts yet</div>
          ) : (
            <div className="cd-contacts-list">
              {contacts.map(contact => (
                <div key={contact.id} className="cd-contact-card">
                  <div className="cd-contact-main">
                    <div className="cd-contact-name">{contact.name}</div>
                    {contact.role && <div className="cd-contact-role">{contact.role}</div>}
                  </div>
                  <div className="cd-contact-details">
                    {contact.email && <div className="cd-contact-field"><span className="cd-field-label">Email</span> <a href={`mailto:${contact.email}`}>{contact.email}</a></div>}
                    {contact.phone && <div className="cd-contact-field"><span className="cd-field-label">Phone</span> <a href={`tel:${contact.phone}`}>{contact.phone}</a></div>}
                    {contact.wechat && <div className="cd-contact-field"><span className="cd-field-label">WeChat</span> {contact.wechat}</div>}
                    {contact.notes && <div className="cd-contact-field"><span className="cd-field-label">Notes</span> {contact.notes}</div>}
                  </div>
                  <div className="cd-contact-actions">
                    <button className="cd-contact-btn" onClick={() => handleEditContact(contact)}>Edit</button>
                    <button className="cd-contact-btn danger" onClick={() => setDeleteContactConfirm(contact)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="cd-right-col">
          <div className="cd-card">
            <div className="cd-card-header">
              <h3>Recent Visits</h3>
              <button className="cd-link" onClick={() => navigate('/visits')}>View all</button>
            </div>
            {clientVisits.length === 0 ? (
              <div className="cd-empty">No visits recorded</div>
            ) : (
              <div className="cd-list">
                {clientVisits.map(v => {
                  const visitor = v.visited_by_user?.name || '-';
                  const reportCount = (v.reports || []).filter(r => r.section !== METADATA_SECTION).length;
                  return (
                    <div key={v.id} className="cd-list-item" onClick={() => navigate(`/visits/${v.id}`)}>
                      <div className="cd-list-main">
                        <div className="cd-list-title">{formatDate(v.visit_date)}</div>
                        <div className="cd-list-sub">by {visitor}</div>
                      </div>
                      <span className={`cd-report-badge ${reportCount > 0 ? 'ready' : 'missing'}`}>
                        {reportCount > 0 ? `${reportCount} report${reportCount > 1 ? 's' : ''}` : 'No report'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="cd-card">
            <div className="cd-card-header">
              <h3>Open Follow-ups ({openTodos.length})</h3>
              <button className="cd-link" onClick={() => navigate('/tasks')}>View all</button>
            </div>
            {openTodos.length === 0 ? (
              <div className="cd-empty">No open follow-ups</div>
            ) : (
              <div className="cd-list">
                {openTodos.slice(0, 5).map(t => (
                  <div key={t.id} className="cd-list-item" onClick={() => navigate('/tasks')}>
                    <div className="cd-list-main">
                      <div className="cd-list-title">{t.title}</div>
                      {t.due_date && <div className="cd-list-sub">Due: {formatDate(t.due_date)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete contact modal */}
      {deleteContactConfirm && (
        <div className="cd-modal-overlay" onClick={() => setDeleteContactConfirm(null)}>
          <div className="cd-modal" onClick={e => e.stopPropagation()}>
            <h2>Delete Contact</h2>
            <p>Delete <strong>{deleteContactConfirm.name}</strong>?</p>
            <div className="cd-modal-actions">
              <button className="cd-btn-cancel" onClick={() => setDeleteContactConfirm(null)}>Cancel</button>
              <button className="cd-btn-danger" onClick={handleDeleteContact}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
