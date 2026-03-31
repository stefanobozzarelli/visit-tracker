import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Trips.css';

interface TripData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  destination?: string;
  notes?: string;
  days: any[];
  created_at: string;
  user?: { id: string; name: string; email: string };
}

const DAY_NAMES_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function generateDays(startDate: string, endDate: string): any[] {
  const days: any[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push({
      id: `d${Date.now()}_${days.length}`,
      date: `${year}-${month}-${day}`,
      dayOfWeek: DAY_NAMES_IT[d.getDay()],
      location: '',
      hotel: '',
      hotelStatus: 'programmato',
      notes: '',
      flights: [],
      appointments: [],
    });
  }
  return days;
}

function formatDateRange(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const s = new Date(startDate + 'T00:00:00').toLocaleDateString('it-IT', opts);
  const e = new Date(endDate + 'T00:00:00').toLocaleDateString('it-IT', opts);
  return `${s} — ${e}`;
}

function countStats(trip: TripData) {
  const flights = trip.days.reduce((s: number, d: any) => s + (d.flights?.length || 0), 0);
  const hotels = new Set(trip.days.map((d: any) => d.hotel).filter(Boolean)).size;
  const apts = trip.days.reduce((s: number, d: any) => s + (d.appointments?.length || 0), 0);
  return { flights, hotels, apts };
}

export const Trips: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripData | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    destination: '',
    startDate: '',
    endDate: '',
    notes: '',
    autoGenDays: true,
  });

  const loadTrips = async () => {
    try {
      const res = await (apiService as any).getTrips();
      if (res.success) setTrips(res.data || []);
    } catch (e) {
      console.error('Failed to load trips:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const openNew = () => {
    setEditingTrip(null);
    setForm({ name: '', destination: '', startDate: '', endDate: '', notes: '', autoGenDays: true });
    setShowModal(true);
  };

  const openEdit = (e: React.MouseEvent, trip: TripData) => {
    e.stopPropagation();
    setEditingTrip(trip);
    setForm({
      name: trip.name,
      destination: trip.destination || '',
      startDate: trip.startDate,
      endDate: trip.endDate,
      notes: trip.notes || '',
      autoGenDays: false,
    });
    setShowModal(true);
  };

  const handleDelete = async (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    if (!confirm('Eliminare questo viaggio?')) return;
    try {
      await (apiService as any).deleteTrip(tripId);
      setTrips(prev => prev.filter(t => t.id !== tripId));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.startDate || !form.endDate) return;
    try {
      let days = editingTrip?.days || [];
      if (!editingTrip && form.autoGenDays && form.startDate && form.endDate) {
        days = generateDays(form.startDate, form.endDate);
      }
      if (editingTrip) {
        const res = await (apiService as any).updateTrip(editingTrip.id, {
          name: form.name,
          destination: form.destination,
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes,
        });
        if (res.success) setTrips(prev => prev.map(t => t.id === editingTrip.id ? res.data : t));
      } else {
        const res = await (apiService as any).createTrip({
          name: form.name,
          destination: form.destination,
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes,
          days,
        });
        if (res.success) setTrips(prev => [res.data, ...prev]);
      }
      setShowModal(false);
    } catch (e) {
      console.error('Save trip failed:', e);
    }
  };

  return (
    <div className="trips-page">
      <div className="trips-header">
        <div>
          <h1 className="trips-title">✈ Viaggi</h1>
          <p className="trips-subtitle">{trips.length} {trips.length === 1 ? 'viaggio' : 'viaggi'}</p>
        </div>
        <button className="trip-btn-primary" onClick={openNew}>
          + Nuovo Viaggio
        </button>
      </div>

      {loading ? (
        <div className="trips-loading">Caricamento...</div>
      ) : trips.length === 0 ? (
        <div className="trips-empty">
          <div className="trips-empty-icon">🌏</div>
          <h3>Nessun viaggio</h3>
          <p>Crea il tuo primo viaggio per iniziare</p>
          <button className="trip-btn-primary" onClick={openNew}>+ Nuovo Viaggio</button>
        </div>
      ) : (
        <div className="trips-grid">
          {trips.map(trip => {
            const stats = countStats(trip);
            return (
              <div key={trip.id} className="trip-card" onClick={() => navigate(`/trips/${trip.id}`)}>
                <div className="trip-card-left">
                  <div className="trip-card-icon">✈</div>
                  <div className="trip-card-info">
                    <h3 className="trip-card-name">{trip.name}</h3>
                    <p className="trip-card-dates">{formatDateRange(trip.startDate, trip.endDate)}</p>
                    {trip.destination && <p className="trip-card-destination">{trip.destination}</p>}
                    {isAdmin && trip.user && (
                      <p className="trip-card-owner">👤 {trip.user.name}</p>
                    )}
                  </div>
                </div>
                <div className="trip-card-right">
                  <div className="trip-card-stats">
                    <div className="trip-stat">
                      <div className="trip-stat-value">{trip.days.length}</div>
                      <div className="trip-stat-label">giorni</div>
                    </div>
                    <div className="trip-stat">
                      <div className="trip-stat-value">{stats.flights}</div>
                      <div className="trip-stat-label">voli</div>
                    </div>
                    <div className="trip-stat">
                      <div className="trip-stat-value">{stats.hotels}</div>
                      <div className="trip-stat-label">hotel</div>
                    </div>
                    <div className="trip-stat">
                      <div className="trip-stat-value">{stats.apts}</div>
                      <div className="trip-stat-label">appunt.</div>
                    </div>
                  </div>
                  <div className="trip-card-actions">
                    <button className="trip-action-btn" onClick={e => openEdit(e, trip)} title="Modifica">✏</button>
                    <button className="trip-action-btn delete" onClick={e => handleDelete(e, trip.id)} title="Elimina">🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New / Edit Trip Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editingTrip ? 'Modifica Viaggio' : 'Nuovo Viaggio'}</h2>
            <div className="form-group">
              <label>Nome viaggio *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="es. Viaggio Oriente 2026"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Destinazione</label>
              <input
                type="text"
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="es. Corea, Taiwan, HK, Singapore"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Data inizio *</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Data fine *</label>
                <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {!editingTrip && (
              <label className="form-checkbox">
                <input type="checkbox" checked={form.autoGenDays} onChange={e => setForm(f => ({ ...f, autoGenDays: e.target.checked }))} />
                Genera automaticamente tutti i giorni
              </label>
            )}
            <div className="form-group">
              <label>Note</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Note..." />
            </div>
            <div className="modal-actions">
              <button className="trip-btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="trip-btn-primary" onClick={handleSave}>
                {editingTrip ? 'Salva' : 'Crea Viaggio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
