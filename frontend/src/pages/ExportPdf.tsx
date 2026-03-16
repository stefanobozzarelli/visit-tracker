import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/ExportPdf.css';

import { config } from '../config';
const API_BASE_URL = config.API_BASE_URL;

interface Visit {
  id: string;
  visit_date: string;
  client?: {
    id: string;
    name: string;
  };
  visited_by_user?: {
    id: string;
    name: string;
  };
  reports?: any[];
}

interface Client {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
}

export const ExportPdf = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [filteredVisits, setFilteredVisits] = useState<Visit[]>([]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterVisits();
  }, [startDate, endDate, selectedClient, selectedCompanies, visits]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Load clients
      const clientsRes = await axios.get(`${API_BASE_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(clientsRes.data.data);

      // Load companies
      const companiesRes = await axios.get(`${API_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(companiesRes.data.data);

      // Load visits
      const visitsRes = await axios.get(`${API_BASE_URL}/visits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVisits(visitsRes.data.data);
    } catch (err) {
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filterVisits = () => {
    let filtered = [...visits];

    // Filter by start date
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter((v) => new Date(v.visit_date) >= start);
    }

    // Filter by end date
    if (endDate) {
      const end = new Date(endDate);
      filtered = filtered.filter((v) => new Date(v.visit_date) <= end);
    }

    // Filter by client
    if (selectedClient) {
      filtered = filtered.filter((v) => v.client?.id === selectedClient);
    }

    // Filter by companies
    if (selectedCompanies.length > 0) {
      filtered = filtered.filter(
        (v) =>
          v.reports &&
          v.reports.some((r) => selectedCompanies.includes(r.company_id))
      );
    }

    setFilteredVisits(filtered);
  };

  const handleCompanyToggle = (companyId: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(companyId)
        ? prev.filter((c) => c !== companyId)
        : [...prev, companyId]
    );
  };

  const handleExportPdf = async () => {
    if (filteredVisits.length === 0) {
      setError('No visits to export');
      return;
    }

    try {
      setExporting(true);
      const token = localStorage.getItem('token');

      const response = await axios.post(
        `${API_BASE_URL}/visits/export-pdf`,
        {
          startDate: startDate || null,
          endDate: endDate || null,
          clientId: selectedClient || null,
          companyIds: selectedCompanies.length > 0 ? selectedCompanies : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      // Download the PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `visits-report-${new Date().getTime()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      setError('Error exporting PDF');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="export-pdf"><p>Loading...</p></div>;
  }

  return (
    <div className="export-pdf">
      <div className="header">
        <h1>Export Report to PDF</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/visits')}>
          ← Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="export-container">
        <div className="filters-section">
          <h2>Filters</h2>

          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Client</label>
            <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Companies</label>
            <div className="companies-list">
              {companies.map((company) => (
                <label key={company.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedCompanies.includes(company.id)}
                    onChange={() => handleCompanyToggle(company.id)}
                  />
                  {company.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="preview-section">
          <h2>Visits Preview</h2>
          <div className="stats">
            <p>
              <strong>Visits found:</strong> {filteredVisits.length}
            </p>
          </div>

          {filteredVisits.length === 0 ? (
            <p className="no-data">No visits match the filters</p>
          ) : (
            <div className="visits-list">
              {filteredVisits.map((visit) => (
                <div key={visit.id} className="visit-item">
                  <div className="visit-header">
                    <strong>{visit.client?.name || 'N/A'}</strong>
                    <span className="visit-date">
                      {new Date(visit.visit_date).toLocaleDateString('it-IT')}
                    </span>
                  </div>
                  <p className="visit-user">
                    Visited by: {visit.visited_by_user?.name || 'N/A'}
                  </p>
                  {visit.reports && visit.reports.length > 0 && (
                    <div className="visit-reports">
                      {visit.reports.map((report) => (
                        <div key={report.id} className="report-item">
                          <span className="company">{report.company?.name}</span>
                          <span className="section">{report.section}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary btn-large"
            onClick={handleExportPdf}
            disabled={filteredVisits.length === 0 || exporting}
          >
            {exporting ? 'Exporting...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPdf;
