import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company } from '../types';
import { encodeMetadata, VisitMetadata } from '../utils/visitMetadata';
import '../styles/CrudPages.css';

export const NewVisit: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', country: '' });
  const [isAddingNewCountry, setIsAddingNewCountry] = useState(false);
  const [newCountryInput, setNewCountryInput] = useState('');

  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCompanyData, setNewCompanyData] = useState({ name: '', country: '', industry: '' });

  const [formData, setFormData] = useState({
    clientId: '',
    visitDate: '',
    reports: [{ companyId: '', section: '', content: '' }],
  });

  const [metadata, setMetadata] = useState<VisitMetadata>({
    location: '',
    purpose: '',
    outcome: '',
    followUpRequired: false,
    nextAction: '',
  });

  // Inline tasks to create with the visit
  const [tasks, setTasks] = useState<{ title: string; companyId: string; dueDate: string; assignedToUserId: string; files: File[] }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Derive unique countries from existing clients + newly added countries in form
  const countries = useMemo(() => {
    const uniqueCountries = new Set(clients.map(c => c.country).filter(Boolean));
    // Also include newClientData.country if it's set but not in the list (for new countries being added)
    if (newClientData.country && !uniqueCountries.has(newClientData.country)) {
      uniqueCountries.add(newClientData.country);
    }
    return Array.from(uniqueCountries).sort();
  }, [clients, newClientData.country]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Load clients and companies independently - one failure should NOT affect the other
      try {
        const clientsRes = await apiService.getClients();
        if (clientsRes.success && clientsRes.data) {
          const sortedClients = clientsRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setClients(sortedClients);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load clients:', err);
      }

      try {
        const companiesRes = await apiService.getCompanies();
        if (companiesRes.success && companiesRes.data) {
          const sortedCompanies = companiesRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setCompanies(sortedCompanies);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load companies:', err);
      }

      try {
        const usersRes = await apiService.getUsers();
        if (usersRes.success && usersRes.data) {
          const sortedUsers = usersRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setUsers(sortedUsers);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load users:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddReport = () => {
    setFormData({
      ...formData,
      reports: [...formData.reports, { companyId: '', section: '', content: '' }],
    });
  };

  const handleRemoveReport = (index: number) => {
    setFormData({
      ...formData,
      reports: formData.reports.filter((_, i) => i !== index),
    });
  };

  const handleReportChange = (index: number, field: string, value: string) => {
    const newReports = [...formData.reports];
    newReports[index] = { ...newReports[index], [field]: value };
    setFormData({ ...formData, reports: newReports });
  };

  const handleCreateClient = async () => {
    if (!newClientData.name || !newClientData.country) {
      setError('Fill in client name and country');
      return;
    }

    try {
      const response = await apiService.createClient(newClientData.name, newClientData.country);
      if (response.success) {
        const updatedClients = [...clients, response.data].sort((a, b) => a.name.localeCompare(b.name));
        setClients(updatedClients);
        setFormData({ ...formData, clientId: response.data.id });
        setShowNewClientForm(false);
        setNewClientData({ name: '', country: '' });
        setSuccess('Client created successfully');
      }
    } catch (err) {
      setError('Error creating client');
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyData.name || !newCompanyData.country) {
      setError('Fill in company name and country');
      return;
    }

    try {
      const response = await apiService.createCompany(newCompanyData.name, newCompanyData.country, newCompanyData.industry);
      if (response.success) {
        const updatedCompanies = [...companies, response.data].sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(updatedCompanies);
        // Auto-select in first report
        if (formData.reports.length > 0) {
          const newReports = [...formData.reports];
          newReports[0].companyId = response.data.id;
          setFormData({ ...formData, reports: newReports });
        }
        setShowNewCompanyForm(false);
        setNewCompanyData({ name: '', country: '', industry: '' });
        setSuccess('Company created successfully');
      }
    } catch (err) {
      setError('Error creating company');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const reports = formData.reports.map((r) => ({
        company_id: r.companyId,
        section: r.section,
        content: r.content,
      }));

      // Add metadata as hidden report if any fields are filled
      const metaReport = encodeMetadata(metadata);
      if (metaReport && formData.reports[0]?.companyId) {
        reports.push({
          company_id: formData.reports[0].companyId,
          section: metaReport.section,
          content: metaReport.content,
        });
      }

      const response = await apiService.createVisit(formData.clientId, formData.visitDate, reports);
      if (response.success) {
        // Create inline tasks if any
        for (const task of tasks) {
          if (task.title.trim()) {
            try {
              const todoRes = await apiService.createTodo(
                task.title,
                formData.clientId,
                task.companyId || formData.reports[0]?.companyId || '',
                task.assignedToUserId || user?.id || '',
                task.dueDate || undefined,
              );
              // Upload task attachments if any
              if (todoRes.success && todoRes.data?.id && task.files?.length > 0) {
                for (const file of task.files) {
                  try {
                    await apiService.uploadTodoAttachment(todoRes.data.id, file);
                  } catch { /* non-blocking */ }
                }
              }
            } catch { /* non-blocking */ }
          }
        }
        navigate(`/visits/${response.data.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Register Visit</h1>
        <button onClick={() => navigate('/visits')} className="btn-secondary">
          ← Back to Visits
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Client *</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                required
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.country})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClientForm(!showNewClientForm)}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                + New Client
              </button>
            </div>

            {showNewClientForm && (
              <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '10px' }}>
                <div className="form-group">
                  <label>Client Name</label>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newClientData.name}
                    onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Country</label>
                  {isAddingNewCountry ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="New country name..."
                        value={newCountryInput}
                        onChange={(e) => setNewCountryInput(e.target.value)}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCountryInput.trim()) {
                            setNewClientData({ ...newClientData, country: newCountryInput.trim() });
                            setIsAddingNewCountry(false);
                            setNewCountryInput('');
                          }
                        }}
                        style={{ padding: '8px 16px', backgroundColor: '#4a6078', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingNewCountry(false); setNewCountryInput(''); }}
                        style={{ padding: '8px 12px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={newClientData.country}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewCountry(true);
                        } else {
                          setNewClientData({ ...newClientData, country: e.target.value });
                        }
                      }}
                    >
                      <option value="">Select country...</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__add_new__">+ Add new country...</option>
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={handleCreateClient} className="btn-primary" style={{ flex: 1 }}>
                    Create Client
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewClientForm(false);
                      setNewClientData({ name: '', country: '' });
                    }}
                    className="btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Visit Date *</label>
            <input
              type="date"
              value={formData.visitDate}
              onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
              required
            />
          </div>

          {/* Visit Metadata */}
          <div style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: '#fafbfc' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Visit Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Location</label>
                <input
                  type="text"
                  placeholder="e.g. Milan office, phone call..."
                  value={metadata.location}
                  onChange={e => setMetadata({ ...metadata, location: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Product presentation, follow-up..."
                  value={metadata.purpose}
                  onChange={e => setMetadata({ ...metadata, purpose: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Outcome</label>
              <input
                type="text"
                placeholder="e.g. Positive, order placed, need follow-up..."
                value={metadata.outcome}
                onChange={e => setMetadata({ ...metadata, outcome: e.target.value })}
              />
            </div>
            {/* Next Action and Follow-up removed — use Tasks page to create follow-ups */}
          </div>

          <h3>Report per Company</h3>

          {formData.reports.map((report, index) => (
            <div
              key={index}
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#fafafa',
              }}
            >
              <div className="form-group">
                <label>Represented Company *</label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <select
                    value={report.companyId}
                    onChange={(e) => handleReportChange(index, 'companyId', e.target.value)}
                    required
                    style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
                  >
                    <option value="">Select company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCompanyForm(!showNewCompanyForm)}
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + New Company
                  </button>
                </div>

                {showNewCompanyForm && (
                  <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '10px' }}>
                    <div className="form-group">
                      <label>Company Name</label>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newCompanyData.name}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Country</label>
                      <input
                        type="text"
                        placeholder="Country"
                        value={newCompanyData.country}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, country: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Industry (optional)</label>
                      <input
                        type="text"
                        placeholder="E.g: Technology, Finance, etc."
                        value={newCompanyData.industry}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, industry: e.target.value })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="button" onClick={handleCreateCompany} className="btn-primary" style={{ flex: 1 }}>
                        Create Company
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewCompanyForm(false);
                          setNewCompanyData({ name: '', country: '', industry: '' });
                        }}
                        className="btn-secondary"
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Report Section *</label>
                <input
                  type="text"
                  placeholder="E.g: Analysis, Proposals, Follow-up, etc."
                  value={report.section}
                  onChange={(e) => handleReportChange(index, 'section', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Report Content *</label>
                <textarea
                  placeholder="Describe the result of the visit for this company..."
                  value={report.content}
                  onChange={(e) => handleReportChange(index, 'content', e.target.value)}
                  rows={5}
                  required
                />
              </div>

              {formData.reports.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveReport(index)}
                  className="btn-danger"
                >
                  Remove Section
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddReport}
            className="btn-secondary"
            style={{ marginBottom: '1rem' }}
          >
            + Add Another Company
          </button>

          {/* Tasks section */}
          <h3 style={{ marginTop: '1.5rem' }}>Tasks</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-tertiary)', marginBottom: '0.75rem' }}>
            Add follow-up tasks for this visit. They will be created when you register the visit.
          </p>
          {tasks.map((task, idx) => (
            <div key={idx} style={{ padding: '0.75rem', marginBottom: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Task *</label>
                  <input
                    type="text"
                    placeholder="e.g. Send quotation..."
                    value={task.title}
                    onChange={e => { const t = [...tasks]; t[idx].title = e.target.value; setTasks(t); }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Company</label>
                  <select
                    value={task.companyId}
                    onChange={e => { const t = [...tasks]; t[idx].companyId = e.target.value; setTasks(t); }}
                  >
                    <option value="">Select company...</option>
                    {formData.reports.filter(r => r.companyId).map((r, i) => {
                      const co = companies.find(c => c.id === r.companyId);
                      return co ? <option key={i} value={co.id}>{co.name}</option> : null;
                    })}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Assigned To</label>
                  <select
                    value={task.assignedToUserId}
                    onChange={e => { const t = [...tasks]; t[idx].assignedToUserId = e.target.value; setTasks(t); }}
                  >
                    <option value="">Select user...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={task.dueDate}
                    onChange={e => { const t = [...tasks]; t[idx].dueDate = e.target.value; setTasks(t); }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTasks(tasks.filter((_, i) => i !== idx))}
                  style={{ padding: '0.5rem', background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: '1.125rem' }}
                >
                  ×
                </button>
              </div>
              {/* Attachments for this task */}
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-info)', padding: '4px 8px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                  Allega file
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files) {
                        const t = [...tasks];
                        t[idx].files = [...(t[idx].files || []), ...Array.from(e.target.files!)];
                        setTasks(t);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {(task.files || []).map((file, fIdx) => (
                  <span key={fIdx} style={{ fontSize: '0.75rem', background: 'var(--color-bg-secondary, #f5f3ee)', padding: '2px 8px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {file.name}
                    <button
                      type="button"
                      onClick={() => { const t = [...tasks]; t[idx].files = t[idx].files.filter((_, i) => i !== fIdx); setTasks(t); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: '0.75rem', padding: '0 2px' }}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTasks([...tasks, { title: '', companyId: formData.reports[0]?.companyId || '', dueDate: '', assignedToUserId: '', files: [] }])}
            className="btn-secondary"
            style={{ marginBottom: '1rem' }}
          >
            + Add Task
          </button>

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Registering...' : 'Register Visit'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/visits')}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
