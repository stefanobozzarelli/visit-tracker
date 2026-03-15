import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Visit } from '../types';
import '../styles/Dashboard.css';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadVisits();
    }
  }, [user?.id]);

  const loadVisits = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getVisits({ user_id: user?.id });
      if (response.success && response.data) {
        setVisits(response.data);
      }
    } catch (err) {
      setError('Errore nel caricamento delle visite');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <div className="dashboard-header">
        <div className="welcome-card">
          <h2>Benvenuto, {user?.name}!</h2>
          <p>Gestisci le tue visite e i tuoi report da qui.</p>
        </div>
        <button onClick={() => navigate('/visits/new')} className="btn-primary">
          + Registra Visita
        </button>
      </div>

      <div className="dashboard-content">
        <h3>Visite Recenti</h3>
        {isLoading ? (
          <p>Caricamento...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : visits.length === 0 ? (
          <p>Nessuna visita registrata</p>
        ) : (
          <div className="visits-list">
            {visits.slice(0, 10).map((visit) => (
              <div key={visit.id} className="visit-card">
                <h4>{visit.client?.name}</h4>
                <p>Data: {new Date(visit.visit_date).toLocaleDateString('it-IT')}</p>
                <p>Report: {visit.reports?.length || 0}</p>
                <button
                  onClick={() => navigate(`/visits/${visit.id}`)}
                  className="btn-secondary"
                >
                  Visualizza
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
