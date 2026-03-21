import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, ClientContact, Company } from '../types';
import '../styles/ClientForm.css';

const EMPTY_CONTACT = { name: '', role: '', email: '', phone: '', wechat: '', notes: '' };

export const ClientForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';
  const isEdit = !!id;

  // Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userAreaCompanyIds, setUserAreaCompanyIds] = useState<string[]>([]);
  const [userAreaCountries, setUserAreaCountries] = useState<string[]>([]);

  // Form
  const [formData, setFormData] = useState({ name: '', country: '', city: '', notes: '', role: 'cliente' });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [isAddingCountry, setIsAddingCountry] = useState(false);
  const [newCountryInput, setNewCountryInput] = useState('');

  // Contact editing
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [pendingBusinessCard, setPendingBusinessCard] = useState<File | null>(null);
  const [editContacts, setEditContacts] = useState<ClientContact[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadData(); }, [id]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load companies
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}

      // Load user areas
      if (!isAdmin) {
        try {
          const r = await apiService.getMyAreas();
          if (r.success && r.data) {
            setUserAreaCompanyIds(r.data.companies?.map((c: any) => c.id) || []);
            setUserAreaCountries(r.data.countries || []);
          }
        } catch {}
      }

      // Load client if editing
      if (isEdit) {
        try {
          const r = await apiService.getClient(id!);
          if (r.success && r.data) {
            const client = r.data;
            setFormData({
              name: client.name,
              country: client.country,
              city: client.city || '',
              notes: client.notes || '',
              role: (client as any).role || 'cliente',
            });
            setSelectedCompanyIds((client as any).clientCompanies?.map((cc: any) => cc.company_id || cc.company?.id) || []);
            setEditContacts(client.contacts || []);
          }
        } catch (err) {
          setError((err as Error).message);
        }
      }
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  // Countries for filter and form
  const countries = useMemo(() => {
    const countrySet = new Set<string>();
    // Include user's area countries
    for (const c of userAreaCountries) countrySet.add(c);
    // Also include formData.country if set but not in the list
    if (formData.country && !countrySet.has(formData.country)) {
      countrySet.add(formData.country);
    }
    return Array.from(countrySet).sort();
  }, [userAreaCountries, formData.country]);

  // Suppliers filtered for form (non-admin sees only their area suppliers)
  const formSuppliers = useMemo(() => {
    if (isAdmin) return companies;
    if (userAreaCompanyIds.length === 0) return companies;
    return companies.filter(c => userAreaCompanyIds.includes(c.id));
  }, [companies, userAreaCompanyIds, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (isEdit) {
        await apiService.updateClient(id!, { ...formData, company_ids: selectedCompanyIds });
        setSuccess('Client updated');
      } else {
        await apiService.createClient(formData.name, formData.country, formData.notes, formData.role, selectedCompanyIds, formData.city);
        setSuccess('Client created');
      }
      setTimeout(() => navigate('/contacts'), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !contactForm.name.trim()) return;
    try {
      if (editingContactId) {
        await apiService.updateClientContact(editingContactId, contactForm);
        setSuccess('Contact updated');
      } else {
        await apiService.addClientContact(id, contactForm);
        setSuccess('Contact added');
      }
      if (!editingContactId && pendingBusinessCard) {
        const reloadRes = await apiService.getClient(id);
        if (reloadRes.success && reloadRes.data) {
          const newContacts = reloadRes.data.contacts || [];
          const newContact = newContacts.find((c: any) => c.name === contactForm.name.trim());
          if (newContact) {
            await apiService.uploadBusinessCard(id, newContact.id, pendingBusinessCard);
          }
        }
      }
      setContactForm(EMPTY_CONTACT);
      setPendingBusinessCard(null);
      setEditingContactId(null);
      setShowContactForm(false);
      const r = await apiService.getClient(id);
      if (r.success && r.data) setEditContacts(r.data.contacts || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await apiService.deleteClientContact(contactId);
      setEditContacts(prev => prev.filter(c => c.id !== contactId));
      setSuccess('Contact deleted');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBusinessCardUpload = async (contactId: string, file: File) => {
    if (!id) return;
    try {
      await apiService.uploadBusinessCard(id, contactId, file);
      const r = await apiService.getClient(id);
      if (r.success && r.data) setEditContacts(r.data.contacts || []);
      setSuccess('Business card uploaded');
    } catch {
      setError('Error uploading business card');
    }
  };

  if (loading) {
    return <div className="cf-page"><div className="cf-loading">Loading...</div></div>;
  }

  return (
    <div className="cf-page">
      {/* Header */}
      <div className="cf-header">
        <button className="cf-back" onClick={() => navigate('/contacts')}>
          ← Back
        </button>
        <h1>{isEdit ? 'Edit Client' : 'Add New Client'}</h1>
      </div>

      {error && <div className="cf-alert cf-alert-error">{error}</div>}
      {success && <div className="cf-alert cf-alert-success">{success}</div>}

      {/* Form */}
      <div className="cf-card">
        <form onSubmit={handleSubmit}>
          <div className="cf-form-row">
            <div className="cf-form-group">
              <label>Client Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="cf-form-group">
              <label>Country *</label>
              {isAddingCountry ? (
                <div className="cf-country-add">
                  <input
                    type="text"
                    value={newCountryInput}
                    onChange={e => setNewCountryInput(e.target.value)}
                    placeholder="New country name..."
                    autoFocus
                  />
                  <button
                    type="button"
                    className="cf-country-btn"
                    onClick={() => {
                      if (newCountryInput.trim()) {
                        setFormData({ ...formData, country: newCountryInput.trim() });
                        setIsAddingCountry(false);
                        setNewCountryInput('');
                      }
                    }}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    className="cf-country-btn cancel"
                    onClick={() => {
                      setIsAddingCountry(false);
                      setNewCountryInput('');
                    }}
                  >
                    X
                  </button>
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
                  {countries.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__add_new__">+ Add new country...</option>
                </select>
              )}
            </div>
            <div className="cf-form-group">
              <label>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                placeholder="City..."
              />
            </div>
            <div className="cf-form-group">
              <label>Type</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="cliente">Client</option>
                <option value="developer">Developer</option>
                <option value="architetto-designer">Architect/Designer</option>
              </select>
            </div>
          </div>

          <div className="cf-form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>

          {/* Suppliers */}
          <div className="cf-form-group">
            <label>Suppliers</label>
            <div className="cf-suppliers-grid">
              {formSuppliers.map(supplier => {
                const isSelected = selectedCompanyIds.includes(supplier.id);
                return (
                  <label
                    key={supplier.id}
                    className={`cf-supplier-item${isSelected ? ' selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedCompanyIds(prev => [...prev, supplier.id]);
                        } else {
                          setSelectedCompanyIds(prev =>
                            prev.filter(id => id !== supplier.id)
                          );
                        }
                      }}
                    />
                    {supplier.name}
                  </label>
                );
              })}
            </div>
            {selectedCompanyIds.length > 0 && (
              <div className="cf-supplier-count">
                {selectedCompanyIds.length} supplier{selectedCompanyIds.length !== 1 ? 's' : ''}
                {' '}selected
              </div>
            )}
          </div>

          <div className="cf-form-actions">
            <button type="submit" className="cf-btn-save" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Client'}
            </button>
            <button
              type="button"
              className="cf-btn-cancel"
              onClick={() => navigate('/contacts')}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Contacts section (only in edit mode) */}
        {isEdit && (
          <div className="cf-contacts-section">
            <div className="cf-contacts-header">
              <h3>Contacts ({editContacts.length})</h3>
              <button
                type="button"
                className="cf-btn-new"
                onClick={() => {
                  setContactForm(EMPTY_CONTACT);
                  setEditingContactId(null);
                  setShowContactForm(true);
                }}
              >
                + Add Contact
              </button>
            </div>

            {showContactForm && (
              <form onSubmit={handleContactSubmit} className="cf-contact-form">
                <div className="cf-contact-form-grid">
                  <div className="cf-form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="cf-form-group">
                    <label>Role / Title</label>
                    <input
                      type="text"
                      value={contactForm.role}
                      onChange={e => setContactForm({ ...contactForm, role: e.target.value })}
                      placeholder="e.g. Sales Manager"
                    />
                  </div>
                  <div className="cf-form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                    />
                  </div>
                  <div className="cf-form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="cf-form-group">
                    <label>WeChat</label>
                    <input
                      type="text"
                      value={contactForm.wechat}
                      onChange={e => setContactForm({ ...contactForm, wechat: e.target.value })}
                    />
                  </div>
                  <div className="cf-form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={contactForm.notes}
                      onChange={e => setContactForm({ ...contactForm, notes: e.target.value })}
                    />
                  </div>
                </div>
                {!editingContactId && (
                  <div className="cf-form-group">
                    <label>Business Card (PDF or image)</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => setPendingBusinessCard(e.target.files?.[0] || null)}
                    />
                    {pendingBusinessCard && (
                      <div className="cf-file-attached">📎 {pendingBusinessCard.name}</div>
                    )}
                  </div>
                )}
                <div className="cf-form-actions">
                  <button type="submit" className="cf-btn-save">
                    {editingContactId ? 'Save' : 'Add'}
                  </button>
                  <button
                    type="button"
                    className="cf-btn-cancel"
                    onClick={() => {
                      setShowContactForm(false);
                      setEditingContactId(null);
                      setContactForm(EMPTY_CONTACT);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="cf-contacts-list">
              {editContacts.map(contact => (
                <div key={contact.id} className="cf-contact-item">
                  <div className="cf-contact-info">
                    <div className="cf-contact-name">{contact.name}</div>
                    <div className="cf-contact-details">
                      {[contact.role, contact.email, contact.phone]
                        .filter(Boolean)
                        .join(' · ') || 'No details'}
                    </div>
                    {(contact as any).business_card_filename && (
                      <div className="cf-contact-card">
                        📎 {(contact as any).business_card_filename}
                      </div>
                    )}
                  </div>
                  <div className="cf-contact-actions">
                    <label className="cf-contact-action-btn upload">
                      📎 Card
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        style={{ display: 'none' }}
                        onChange={e => {
                          if (e.target.files?.[0])
                            handleBusinessCardUpload(contact.id, e.target.files[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="cf-contact-action-btn edit"
                      onClick={() => {
                        setEditingContactId(contact.id);
                        setContactForm({
                          name: contact.name || '',
                          role: contact.role || '',
                          email: contact.email || '',
                          phone: contact.phone || '',
                          wechat: contact.wechat || '',
                          notes: contact.notes || '',
                        });
                        setShowContactForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="cf-contact-action-btn delete"
                      onClick={() => handleDeleteContact(contact.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
