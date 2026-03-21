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
    const cc = (client as any)?.clientCompanies;
    if (cc && cc.length > 0) {
      return cc.map((c: any) => c.company?.name || getCompanyName(c.company_id)).filter((n: string) => n !== '-');
    }
    const ids = new Set<string>();
    for (const v of visits.filter(v => v.client_id === id)) {
      for (const r of (v.reports || [])) {
        if (r.section !== METADATA_SECTION && r.company_id) ids.add(r.company_id);
      }
    }
    return [...ids].map(cid => getCompanyName(cid)).filter(n => n !== '-');
  }, [client, visits, id, companies]);

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
            <span className="cd-header-country">{client.country}{client.city ? `, ${client.city}` : ''}</span>
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
          </div>

          {contacts.length === 0 ? (
            <div className="cd-empty">No contacts yet — use Edit to add contacts</div>
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
                    {(contact as any).business_card_filename && (
                      <div className="cd-contact-field">
                        <span className="cd-field-label">Business Card</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await apiService.downloadBusinessCard(id!, contact.id);
                              if (res.success && res.data?.url) window.open(res.data.url, '_blank');
                            } catch {}
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-info)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}
                        >
                          {(contact as any).business_card_filename}
                        </button>
                      </div>
                    )}
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

      {/* Contact management is in the Edit page (Clients.tsx) */}
    </div>
  );
};
