import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Client, Company } from '../types';
import '../styles/CrudPages.css';

export const NewVisit: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', country: '' });

  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCompanyData, setNewCompanyData] = useState({ name: '', country: '', industry: '' });

  const [formData, setFormData] = useState({
    clientId: '',
    visitDate: '',
    reports: [{ companyId: '', section: '', content: '' }],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [clientsRes, companiesRes] = await Promise.all([
        apiService.getClients(),
        apiService.getCompanies(),
      ]);
      if (clientsRes.success && clientsRes.data) {
        const sortedClients = clientsRes.data.sort((a, b) => a.name.localeCompare(b.name));
        setClients(sortedClients);
      }
      if (companiesRes.success && companiesRes.data) {
        const sortedCompanies = companiesRes.data.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(sortedCompanies);
      }
    } catch (err) {
      setError('Error loading data');
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

      const response = await apiService.createVisit(formData.clientId, formData.visitDate, reports);
      if (response.success) {
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
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                required
                style={{ flex: 1 }}
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
                  <input
                    type="text"
                    placeholder="Country"
                    value={newClientData.country}
                    onChange={(e) => setNewClientData({ ...newClientData, country: e.target.value })}
                  />
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
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <select
                    value={report.companyId}
                    onChange={(e) => handleReportChange(index, 'companyId', e.target.value)}
                    required
                    style={{ flex: 1 }}
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
