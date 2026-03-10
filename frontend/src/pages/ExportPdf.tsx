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

      // Carica clienti
      const clientsRes = await axios.get(`${API_BASE_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(clientsRes.data.data);

      // Carica aziende
      const companiesRes = await axios.get(`${API_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(companiesRes.data.data);

      // Carica visite
      const visitsRes = await axios.get(`${API_BASE_URL}/visits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVisits(visitsRes.data.data);
    } catch (err) {
      setError('Errore nel caricamento dei dati');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filterVisits = () => {
    let filtered = [...visits];

    // Filtra per data inizio
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter((v) => new Date(v.visit_date) >= start);
    }

    // Filtra per data fine
    if (endDate) {
      const end = new Date(endDate);
      filtered = filtered.filter((v) => new Date(v.visit_date) <= end);
    }

    // Filtra per cliente
    if (selectedClient) {
      filtered = filtered.filter((v) => v.client?.id === selectedClient);
    }

    // Filtra per aziende
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
      setError('Nessuna visita da esportare');
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

      // Scarica il PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-visite-${new Date().getTime()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      setError('Errore nell\'esportazione del PDF');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="export-pdf"><p>Caricamento...</p></div>;
  }

  return (
    <div className="export-pdf">
      <div className="header">
        <h1>Esporta Report in PDF</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/visits')}>
          ← Indietro
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="export-container">
        <div className="filters-section">
          <h2>Filtri</h2>

          <div className="form-group">
            <label>Data Inizio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Data Fine</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Cliente</label>
            <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Aziende</label>
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
          <h2>Anteprima Visite</h2>
          <div className="stats">
            <p>
              <strong>Visite trovate:</strong> {filteredVisits.length}
            </p>
          </div>

          {filteredVisits.length === 0 ? (
            <p className="no-data">Nessuna visita corrisponde ai filtri</p>
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
                    Visitato da: {visit.visited_by_user?.name || 'N/A'}
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
            {exporting ? 'Esportazione in corso...' : 'Scarica PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPdf;
