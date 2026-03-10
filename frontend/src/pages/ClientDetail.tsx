import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Client, ClientContact } from '../types';
import '../styles/CrudPages.css';

export const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    loadClient();
  }, [id]);

  const loadClient = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await apiService.getClient(id);
      if (response.success && response.data) {
        setClient(response.data);
      }
    } catch (err) {
      setError('Errore nel caricamento del cliente');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await apiService.addClientContact(
        id,
        contactForm.name,
        contactForm.role,
        contactForm.email,
        contactForm.phone
      );
      setContactForm({ name: '', role: '', email: '', phone: '' });
      setShowContactForm(false);
      loadClient();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (isLoading) return <p>Caricamento...</p>;
  if (!client) return <p>Cliente non trovato</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>{client.name}</h1>
        <button onClick={() => navigate('/clients')} className="btn-secondary">
          ← Torna ai Clienti
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-card">
        <h3>Informazioni Generali</h3>
        <div className="info-group">
          <div>
            <label>Nome</label>
            <p>{client.name}</p>
          </div>
          <div>
            <label>Nazione</label>
            <p>{client.country}</p>
          </div>
        </div>
        {client.notes && (
          <div>
            <label>Note</label>
            <p>{client.notes}</p>
          </div>
        )}
      </div>

      <div className="form-card">
        <div className="page-header">
          <h3>Contatti ({client.contacts?.length || 0})</h3>
          <button onClick={() => setShowContactForm(true)} className="btn-primary">
            + Aggiungi Contatto
          </button>
        </div>

        {showContactForm && (
          <form onSubmit={handleAddContact}>
            <div className="form-group">
              <label>Nome *</label>
              <input
                type="text"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Ruolo</label>
              <input
                type="text"
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Telefono</label>
              <input
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Aggiungi
              </button>
              <button
                type="button"
                onClick={() => setShowContactForm(false)}
                className="btn-secondary"
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {client.contacts && client.contacts.length > 0 ? (
          <div className="contacts-list">
            {client.contacts.map((contact) => (
              <div key={contact.id} className="contact-card">
                <h4>{contact.name}</h4>
                {contact.role && <p><strong>Ruolo:</strong> {contact.role}</p>}
                {contact.email && <p><strong>Email:</strong> {contact.email}</p>}
                {contact.phone && <p><strong>Telefono:</strong> {contact.phone}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p>Nessun contatto</p>
        )}
      </div>
    </div>
  );
};
