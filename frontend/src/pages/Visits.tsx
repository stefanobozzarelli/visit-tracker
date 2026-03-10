import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Visit } from '../types';
import { SearchBar } from '../components/SearchBar';
import '../styles/CrudPages.css';

export const Visits: React.FC = () => {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [displayedVisits, setDisplayedVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    loadVisits();
  }, []);

  const loadVisits = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getVisits();
      if (response.success && response.data) {
        setVisits(response.data);
        setDisplayedVisits(response.data);
        setSearchError('');
      }
    } catch (err) {
      setError('Errore nel caricamento delle visite');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchResults = (results: Visit[]) => {
    setDisplayedVisits(results);
    if (results.length === 0) {
      setSearchError('Nessuna visita trovata');
    } else {
      setSearchError('');
    }
  };

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Visite</h1>
        <button onClick={() => navigate('/visits/new')} className="btn-primary">
          + Registra Nuova Visita
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {searchError && <div className="error-message">{searchError}</div>}

      {!isLoading && visits.length > 0 && (
        <SearchBar
          type="visits"
          onResults={handleSearchResults}
          onLoading={setIsSearching}
          onError={setSearchError}
        />
      )}

      {isLoading ? (
        <p>Caricamento...</p>
      ) : visits.length === 0 ? (
        <p>Nessuna visita registrata</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Data Visita</th>
                <th>Visitato da</th>
                <th>Report</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {displayedVisits.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.client?.name}</td>
                  <td>{new Date(visit.visit_date).toLocaleDateString('it-IT')}</td>
                  <td>{visit.visited_by_user?.name}</td>
                  <td>{visit.reports?.length || 0}</td>
                  <td className="actions">
                    <button
                      onClick={() => navigate(`/visits/${visit.id}`)}
                      className="btn-info"
                    >
                      Visualizza
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
