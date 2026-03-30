import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import '../styles/TripDetail.css';

// ---- Types ----
interface Flight {
  id: string;
  route: string;
  details: string;
  status: 'programmato' | 'confermato';
}

interface Appointment {
  id: string;
  time: string;
  endTime: string;
  client: string;
  status: string;
  notes: string;
}

interface TravelDay {
  id: string;
  date: string;
  dayOfWeek: string;
  location: string;
  hotel: string;
  hotelStatus: 'programmato' | 'confermato';
  notes: string;
  flights: Flight[];
  appointments: Appointment[];
}

interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  destination?: string;
  notes?: string;
  days: TravelDay[];
}

// ---- Status cycles ----
const FLIGHT_STATUSES: Array<'programmato' | 'confermato'> = ['programmato', 'confermato'];
const HOTEL_STATUSES: Array<'programmato' | 'confermato'> = ['programmato', 'confermato'];
const APT_STATUSES = ['programmato', 'in_attesa', 'confermato', 'sollecitato', 'da_modificare', 'rifiutato', 'fatto_report'];

const STATUS_LABELS: Record<string, string> = {
  programmato: 'Programmato',
  confermato: 'Confermato',
  in_attesa: 'In attesa',
  sollecitato: 'Sollecitato',
  da_modificare: 'Da modificare',
  rifiutato: 'Rifiutato',
  fatto_report: 'Fatto / Report',
};

function nextStatus(current: string, cycle: string[]): string {
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(val: string): string {
  const digits = val.replace(/\D/g, '');
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return val;
}

const DAY_NAMES_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---- Main Component ----
export const TripDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'itinerary' | 'report'>('itinerary');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Modals
  const [showEditTripModal, setShowEditTripModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [editingDay, setEditingDay] = useState<TravelDay | null>(null);
  const [showFlightModal, setShowFlightModal] = useState(false);
  const [flightContext, setFlightContext] = useState<{ dayId: string; flight?: Flight } | null>(null);
  const [showAptModal, setShowAptModal] = useState(false);
  const [aptContext, setAptContext] = useState<{ dayId: string; apt?: Appointment } | null>(null);

  // Trip form
  const [tripForm, setTripForm] = useState({ name: '', destination: '', startDate: '', endDate: '', notes: '' });
  // Day form
  const [dayForm, setDayForm] = useState({ date: '', location: '', hotel: '', hotelStatus: 'programmato', notes: '' });
  // Flight form
  const [flightForm, setFlightForm] = useState({ route: '', details: '', status: 'programmato' });
  // Apt form
  const [aptForm, setAptForm] = useState({ time: '', endTime: '', client: '', status: 'programmato', notes: '' });

  // Client autocomplete
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const clientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiService.getClients().then((res: any) => {
      if (res.success && res.data) setClients(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  const loadTrip = async () => {
    try {
      const res = await (apiService as any).getTrip(id);
      if (res.success) setTrip(res.data);
    } catch (e) {
      console.error('Failed to load trip:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadTrip();
  }, [id]);

  // Save updated trip to server
  const saveTrip = useCallback(async (updated: Trip) => {
    setTrip(updated);
    try {
      await (apiService as any).updateTrip(updated.id, { days: updated.days });
    } catch (e) {
      console.error('Save trip failed:', e);
    }
  }, []);

  // ---- Day operations ----
  const updateDayField = (dayId: string, field: string, value: string) => {
    if (!trip) return;
    const days = trip.days.map(d => d.id === dayId ? { ...d, [field]: value } : d);
    saveTrip({ ...trip, days });
  };

  const deleteDay = (dayId: string) => {
    if (!trip || !confirm('Eliminare questo giorno?')) return;
    saveTrip({ ...trip, days: trip.days.filter(d => d.id !== dayId) });
  };

  // ---- Flight operations ----
  const openAddFlight = (dayId: string) => {
    setFlightContext({ dayId });
    setFlightForm({ route: '', details: '', status: 'programmato' });
    setShowFlightModal(true);
  };

  const openEditFlight = (dayId: string, flight: Flight) => {
    setFlightContext({ dayId, flight });
    setFlightForm({ route: flight.route, details: flight.details, status: flight.status });
    setShowFlightModal(true);
  };

  const saveFlight = () => {
    if (!trip || !flightContext) return;
    const days = trip.days.map(d => {
      if (d.id !== flightContext.dayId) return d;
      if (flightContext.flight) {
        return { ...d, flights: d.flights.map(f => f.id === flightContext.flight!.id ? { ...f, ...flightForm } : f) };
      } else {
        return { ...d, flights: [...d.flights, { id: `f${uid()}`, ...flightForm } as Flight] };
      }
    });
    saveTrip({ ...trip, days });
    setShowFlightModal(false);
  };

  const deleteFlight = (dayId: string, flightId: string) => {
    if (!trip) return;
    const days = trip.days.map(d => d.id === dayId ? { ...d, flights: d.flights.filter(f => f.id !== flightId) } : d);
    saveTrip({ ...trip, days });
  };

  const toggleFlightStatus = (dayId: string, flightId: string) => {
    if (!trip) return;
    const days = trip.days.map(d => {
      if (d.id !== dayId) return d;
      return { ...d, flights: d.flights.map(f => f.id === flightId ? { ...f, status: nextStatus(f.status, FLIGHT_STATUSES) as Flight['status'] } : f) };
    });
    saveTrip({ ...trip, days });
  };

  // ---- Hotel operations ----
  const toggleHotelStatus = (dayId: string) => {
    if (!trip) return;
    const days = trip.days.map(d => d.id === dayId ? { ...d, hotelStatus: nextStatus(d.hotelStatus, HOTEL_STATUSES) as TravelDay['hotelStatus'] } : d);
    saveTrip({ ...trip, days });
  };

  // ---- Appointment operations ----
  const openAddApt = (dayId: string) => {
    setAptContext({ dayId });
    setAptForm({ time: '', endTime: '', client: '', status: 'programmato', notes: '' });
    setShowAptModal(true);
  };

  const openEditApt = (dayId: string, apt: Appointment) => {
    setAptContext({ dayId, apt });
    setAptForm({ time: apt.time, endTime: apt.endTime, client: apt.client, status: apt.status, notes: apt.notes });
    setShowAptModal(true);
  };

  const saveApt = () => {
    if (!trip || !aptContext) return;
    const days = trip.days.map(d => {
      if (d.id !== aptContext.dayId) return d;
      if (aptContext.apt) {
        return { ...d, appointments: d.appointments.map(a => a.id === aptContext.apt!.id ? { ...a, ...aptForm } : a) };
      } else {
        return { ...d, appointments: [...d.appointments, { id: `a${uid()}`, ...aptForm }] };
      }
    });
    saveTrip({ ...trip, days });
    setShowAptModal(false);
  };

  const deleteApt = (dayId: string, aptId: string) => {
    if (!trip) return;
    const days = trip.days.map(d => d.id === dayId ? { ...d, appointments: d.appointments.filter(a => a.id !== aptId) } : d);
    saveTrip({ ...trip, days });
  };

  const toggleAptStatus = (dayId: string, aptId: string) => {
    if (!trip) return;
    const days = trip.days.map(d => {
      if (d.id !== dayId) return d;
      return { ...d, appointments: d.appointments.map(a => a.id === aptId ? { ...a, status: nextStatus(a.status, APT_STATUSES) } : a) };
    });
    saveTrip({ ...trip, days });
  };

  // ---- Save new day ----
  const saveDay = () => {
    if (!trip || !dayForm.date) return;
    const d = new Date(dayForm.date + 'T00:00:00');
    if (editingDay) {
      const days = trip.days.map(day => day.id === editingDay.id ? { ...day, ...dayForm } : day);
      saveTrip({ ...trip, days });
    } else {
      const newDay: TravelDay = {
        id: `d${uid()}`,
        date: dayForm.date,
        dayOfWeek: DAY_NAMES_IT[d.getDay()],
        location: dayForm.location,
        hotel: dayForm.hotel,
        hotelStatus: dayForm.hotelStatus as TravelDay['hotelStatus'],
        notes: dayForm.notes,
        flights: [],
        appointments: [],
      };
      saveTrip({ ...trip, days: [...trip.days, newDay] });
    }
    setShowDayModal(false);
  };

  // ---- Save trip meta ----
  const saveTripMeta = async () => {
    if (!trip) return;
    const updated = { ...trip, ...tripForm };
    setTrip(updated);
    try {
      await (apiService as any).updateTrip(trip.id, {
        name: tripForm.name,
        destination: tripForm.destination,
        startDate: tripForm.startDate,
        endDate: tripForm.endDate,
        notes: tripForm.notes,
      });
    } catch (e) {
      console.error('Save trip meta failed:', e);
    }
    setShowEditTripModal(false);
  };

  const deleteTrip = async () => {
    if (!trip || !confirm('Eliminare questo viaggio?')) return;
    try {
      await (apiService as any).deleteTrip(trip.id);
      navigate('/trips');
    } catch (e) {
      console.error('Delete trip failed:', e);
    }
  };

  // ---- Computed stats ----
  const totalFlights = trip?.days.reduce((s, d) => s + d.flights.length, 0) || 0;
  const totalApts = trip?.days.reduce((s, d) => s + d.appointments.length, 0) || 0;
  const hotelNames = trip ? [...new Set(trip.days.map(d => d.hotel).filter(Boolean))].length : 0;
  const sortedDays = trip ? [...trip.days].sort((a, b) => a.date.localeCompare(b.date)) : [];

  // ---- Hotel blocks for report ----
  const hotelBlocks: { hotel: string; checkIn: string; checkOut: string; nights: number; status: string }[] = [];
  let currentHotel: typeof hotelBlocks[0] | null = null;
  for (const day of sortedDays.filter(d => d.hotel)) {
    if (currentHotel && currentHotel.hotel === day.hotel) {
      currentHotel.checkOut = day.date;
      currentHotel.nights++;
    } else {
      if (currentHotel) hotelBlocks.push(currentHotel);
      currentHotel = { hotel: day.hotel, checkIn: day.date, checkOut: day.date, nights: 1, status: day.hotelStatus };
    }
  }
  if (currentHotel) hotelBlocks.push(currentHotel);

  if (loading) return <div className="trip-detail-loading">Caricamento...</div>;
  if (!trip) return <div className="trip-detail-loading">Viaggio non trovato</div>;

  return (
    <div className="trip-detail-page">
      {/* Header */}
      <div className="trip-detail-header">
        <button className="trip-detail-back" onClick={() => navigate('/trips')}>
          ← Viaggi
        </button>
        <div className="trip-detail-header-top">
          <div>
            <h1 className="trip-detail-title">{trip.name}</h1>
            <p className="trip-detail-meta">
              {new Date(trip.startDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' — '}
              {new Date(trip.endDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {trip.destination && <p className="trip-detail-destination">📍 {trip.destination}</p>}
            <div className="trip-detail-stats">
              <span className="trip-detail-stat"><strong>{trip.days.length}</strong> giorni</span>
              <span className="trip-detail-stat"><strong>{totalFlights}</strong> voli</span>
              <span className="trip-detail-stat"><strong>{hotelNames}</strong> hotel</span>
              <span className="trip-detail-stat"><strong>{totalApts}</strong> appuntamenti</span>
            </div>
          </div>
          <div className="trip-detail-actions">
            <button className="trip-btn-secondary" onClick={() => {
              setTripForm({ name: trip.name, destination: trip.destination || '', startDate: trip.startDate, endDate: trip.endDate, notes: trip.notes || '' });
              setShowEditTripModal(true);
            }}>✏ Modifica</button>
            <button className="trip-btn-danger" onClick={deleteTrip}>🗑 Elimina</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="trip-tabs">
        <button className={`trip-tab ${activeTab === 'itinerary' ? 'active' : ''}`} onClick={() => setActiveTab('itinerary')}>
          Itinerario
        </button>
        <button className={`trip-tab ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>
          Report
        </button>
      </div>

      {/* ---- ITINERARY TAB ---- */}
      {activeTab === 'itinerary' && (
        <div className="trip-days-list">
          {sortedDays.map(day => (
            <div key={day.id} className={`trip-day-card ${day.date === todayStr ? 'today' : ''}`}>
              <div className="trip-day-header">
                <div className="trip-day-date">
                  <span className="trip-day-date-text">{formatDateShort(day.date)}</span>
                  {day.date === todayStr && <span className="trip-day-today-badge">OGGI</span>}
                  <input
                    className="trip-day-location-input"
                    value={day.location}
                    placeholder="Localita..."
                    onChange={e => updateDayField(day.id, 'location', e.target.value)}
                    onBlur={e => updateDayField(day.id, 'location', e.target.value)}
                  />
                </div>
                <div className="trip-day-header-actions">
                  <button className="icon-btn" title="Modifica giorno" onClick={() => {
                    setEditingDay(day);
                    setDayForm({ date: day.date, location: day.location, hotel: day.hotel, hotelStatus: day.hotelStatus, notes: day.notes });
                    setShowDayModal(true);
                  }}>✏</button>
                  <button className="icon-btn delete" title="Elimina giorno" onClick={() => deleteDay(day.id)}>🗑</button>
                </div>
              </div>

              <div className="trip-day-body">
                {/* Flights */}
                <div className="trip-day-section">
                  <span className="trip-day-section-label">Voli</span>
                  <div className="trip-day-section-content">
                    {day.flights.map(f => (
                      <div key={f.id} className="trip-flight-item">
                        <span className="trip-flight-route">{f.route || '—'}</span>
                        <span className="trip-flight-details">{f.details}</span>
                        <button
                          className={`trip-status ${f.status}`}
                          onClick={() => toggleFlightStatus(day.id, f.id)}
                          title="Cambia stato"
                        >
                          {STATUS_LABELS[f.status]}
                        </button>
                        <div className="trip-flight-actions">
                          <button className="icon-btn" onClick={() => openEditFlight(day.id, f)} title="Modifica">✏</button>
                          <button className="icon-btn delete" onClick={() => deleteFlight(day.id, f.id)} title="Elimina">✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="trip-add-btn" onClick={() => openAddFlight(day.id)}>+ volo</button>
                  </div>
                </div>

                {/* Hotel */}
                <div className="trip-day-section">
                  <span className="trip-day-section-label">Hotel</span>
                  <div className="trip-day-section-content">
                    <div className="trip-hotel-row">
                      <input
                        className="trip-hotel-input"
                        value={day.hotel}
                        placeholder="Nome hotel..."
                        onChange={e => updateDayField(day.id, 'hotel', e.target.value)}
                        onBlur={e => updateDayField(day.id, 'hotel', e.target.value)}
                      />
                      {day.hotel && (
                        <button
                          className={`trip-status ${day.hotelStatus}`}
                          onClick={() => toggleHotelStatus(day.id)}
                          title="Cambia stato"
                        >
                          {STATUS_LABELS[day.hotelStatus]}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Appointments */}
                <div className="trip-day-section">
                  <span className="trip-day-section-label">Appunt.</span>
                  <div className="trip-day-section-content">
                    {day.appointments.map(a => (
                      <div key={a.id} className="trip-apt-item">
                        <span className="trip-apt-time">
                          {a.time || '—'}{a.endTime ? `–${a.endTime}` : ''}
                        </span>
                        <span className="trip-apt-client">{a.client}</span>
                        {a.notes && <span className="trip-apt-notes">{a.notes}</span>}
                        <button
                          className={`trip-status ${a.status}`}
                          onClick={() => toggleAptStatus(day.id, a.id)}
                          title="Cambia stato"
                        >
                          {STATUS_LABELS[a.status] || a.status}
                        </button>
                        <a
                          href={`/visits/new?client=${encodeURIComponent(a.client)}&date=${day.date}`}
                          className="trip-btn-link"
                          title="Crea visita cliente"
                        >
                          + Visita
                        </a>
                        <div className="trip-apt-actions">
                          <button className="icon-btn" onClick={() => openEditApt(day.id, a)} title="Modifica">✏</button>
                          <button className="icon-btn delete" onClick={() => deleteApt(day.id, a.id)} title="Elimina">✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="trip-add-btn" onClick={() => openAddApt(day.id)}>+ appuntamento</button>
                  </div>
                </div>

                {/* Notes */}
                {day.notes && (
                  <div className="trip-day-section">
                    <span className="trip-day-section-label">Note</span>
                    <div className="trip-day-section-content">
                      <span className="trip-notes-text">{day.notes}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <button className="trip-add-day-btn" onClick={() => {
            setEditingDay(null);
            setDayForm({ date: '', location: '', hotel: '', hotelStatus: 'programmato', notes: '' });
            setShowDayModal(true);
          }}>
            + Aggiungi Giorno
          </button>
        </div>
      )}

      {/* ---- REPORT TAB ---- */}
      {activeTab === 'report' && (
        <div className="trip-report">
          {/* Itinerary table */}
          <div className="trip-report-block">
            <div className="trip-report-block-header blue">Itinerario Completo</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="trip-report-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Localita</th>
                    <th>Volo</th>
                    <th>Hotel</th>
                    <th>Appuntamenti</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDays.map(day => (
                    <tr key={day.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--color-accent)', fontWeight: 600 }}>{formatDateShort(day.date)}</td>
                      <td style={{ fontWeight: 600 }}>{day.location}</td>
                      <td>
                        {day.flights.map(f => (
                          <div key={f.id} style={{ marginBottom: 4 }}>
                            <span className="trip-report-route">{f.route}</span>
                            {' '}
                            <span className="trip-report-muted">{f.details}</span>
                            {' '}
                            <span className={`trip-status ${f.status}`}>{STATUS_LABELS[f.status]}</span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {day.hotel && (
                          <>
                            {day.hotel}{' '}
                            <span className={`trip-status ${day.hotelStatus}`}>{STATUS_LABELS[day.hotelStatus]}</span>
                          </>
                        )}
                      </td>
                      <td>
                        {day.appointments.map(a => (
                          <div key={a.id} style={{ marginBottom: 3, fontSize: '0.8rem' }}>
                            <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>
                              {a.time || '—'}{a.endTime ? `–${a.endTime}` : ''}
                            </span>
                            {' '}
                            <strong>{a.client}</strong>
                            {' '}
                            <span className={`trip-status ${a.status}`}>{STATUS_LABELS[a.status]}</span>
                          </div>
                        ))}
                      </td>
                      <td className="trip-report-muted">{day.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Flights table */}
          {totalFlights > 0 && (
            <div className="trip-report-block">
              <div className="trip-report-block-header teal">Voli</div>
              <table className="trip-report-table">
                <thead>
                  <tr><th>Data</th><th>Tratta</th><th>Dettagli</th><th>Stato</th></tr>
                </thead>
                <tbody>
                  {sortedDays.flatMap(day => day.flights.map(f => (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateShort(day.date)}</td>
                      <td className="trip-report-route">{f.route}</td>
                      <td className="trip-report-muted">{f.details}</td>
                      <td><span className={`trip-status ${f.status}`}>{STATUS_LABELS[f.status]}</span></td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}

          {/* Hotels table */}
          {hotelBlocks.length > 0 && (
            <div className="trip-report-block">
              <div className="trip-report-block-header purple">Hotel</div>
              <table className="trip-report-table">
                <thead>
                  <tr><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Notti</th><th>Stato</th></tr>
                </thead>
                <tbody>
                  {hotelBlocks.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h.hotel}</td>
                      <td>{new Date(h.checkIn + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</td>
                      <td>{new Date(h.checkOut + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</td>
                      <td>{h.nights}</td>
                      <td><span className={`trip-status ${h.status}`}>{STATUS_LABELS[h.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Appointments table */}
          {totalApts > 0 && (
            <div className="trip-report-block">
              <div className="trip-report-block-header green">Appuntamenti</div>
              <table className="trip-report-table">
                <thead>
                  <tr><th>Data</th><th>Localita</th><th>Ora Inizio</th><th>Ora Fine</th><th>Cliente</th><th>Stato</th></tr>
                </thead>
                <tbody>
                  {sortedDays.flatMap(day => day.appointments.map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateShort(day.date)}</td>
                      <td>{day.location}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.time || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.endTime || ''}</td>
                      <td style={{ fontWeight: 600 }}>{a.client}</td>
                      <td><span className={`trip-status ${a.status}`}>{STATUS_LABELS[a.status]}</span></td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======= MODALS ======= */}

      {/* Edit Trip Modal */}
      {showEditTripModal && (
        <div className="modal-overlay" onClick={() => setShowEditTripModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Modifica Viaggio</h2>
            <div className="form-group">
              <label>Nome viaggio</label>
              <input value={tripForm.name} onChange={e => setTripForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Destinazione</label>
              <input value={tripForm.destination} onChange={e => setTripForm(f => ({ ...f, destination: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Data inizio</label>
                <input type="date" value={tripForm.startDate} onChange={e => setTripForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Data fine</label>
                <input type="date" value={tripForm.endDate} onChange={e => setTripForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea rows={2} value={tripForm.notes} onChange={e => setTripForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="trip-btn-secondary" onClick={() => setShowEditTripModal(false)}>Annulla</button>
              <button className="trip-btn-primary" onClick={saveTripMeta}>Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Day Modal */}
      {showDayModal && (
        <div className="modal-overlay" onClick={() => setShowDayModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editingDay ? 'Modifica Giorno' : 'Nuovo Giorno'}</h2>
            <div className="form-group">
              <label>Data *</label>
              <input type="date" value={dayForm.date} onChange={e => setDayForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Localita</label>
              <input value={dayForm.location} onChange={e => setDayForm(f => ({ ...f, location: e.target.value }))} placeholder="es. Seoul" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Hotel</label>
                <input value={dayForm.hotel} onChange={e => setDayForm(f => ({ ...f, hotel: e.target.value }))} placeholder="Nome hotel" />
              </div>
              <div className="form-group">
                <label>Stato hotel</label>
                <select value={dayForm.hotelStatus} onChange={e => setDayForm(f => ({ ...f, hotelStatus: e.target.value }))}>
                  <option value="programmato">Programmato</option>
                  <option value="confermato">Confermato</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea rows={2} value={dayForm.notes} onChange={e => setDayForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="trip-btn-secondary" onClick={() => setShowDayModal(false)}>Annulla</button>
              <button className="trip-btn-primary" onClick={saveDay}>{editingDay ? 'Salva' : 'Aggiungi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Flight Modal */}
      {showFlightModal && (
        <div className="modal-overlay" onClick={() => setShowFlightModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{flightContext?.flight ? 'Modifica Volo' : 'Nuovo Volo'}</h2>
            <div className="form-group">
              <label>Tratta (es. MXP-ICN)</label>
              <input
                value={flightForm.route}
                onChange={e => setFlightForm(f => ({ ...f, route: e.target.value }))}
                placeholder="BRI-IST"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Dettagli (volo + orari)</label>
              <input
                value={flightForm.details}
                onChange={e => setFlightForm(f => ({ ...f, details: e.target.value }))}
                placeholder="TK1466 20:35/23:35"
              />
            </div>
            <div className="form-group">
              <label>Stato</label>
              <select value={flightForm.status} onChange={e => setFlightForm(f => ({ ...f, status: e.target.value }))}>
                <option value="programmato">Programmato</option>
                <option value="confermato">Confermato</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="trip-btn-secondary" onClick={() => setShowFlightModal(false)}>Annulla</button>
              <button className="trip-btn-primary" onClick={saveFlight}>{flightContext?.flight ? 'Salva' : 'Aggiungi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Modal */}
      {showAptModal && (
        <div className="modal-overlay" onClick={() => setShowAptModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{aptContext?.apt ? 'Modifica Appuntamento' : 'Nuovo Appuntamento'}</h2>
            <div className="form-group">
              <label>Cliente *</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={clientInputRef}
                  value={aptForm.client}
                  autoFocus
                  placeholder="Nome cliente o cerca..."
                  onChange={e => {
                    const val = e.target.value;
                    setAptForm(f => ({ ...f, client: val }));
                    if (val.length >= 1) {
                      const filtered = clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 8);
                      setClientSuggestions(filtered);
                      setShowSuggestions(filtered.length > 0);
                    } else {
                      setShowSuggestions(false);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'white', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    {clientSuggestions.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={() => {
                          setAptForm(f => ({ ...f, client: c.name }));
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: '0.5rem 0.75rem', cursor: 'pointer',
                          fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Ora inizio</label>
                <input
                  value={aptForm.time}
                  onChange={e => setAptForm(f => ({ ...f, time: e.target.value }))}
                  onBlur={e => setAptForm(f => ({ ...f, time: formatTime(e.target.value) }))}
                  placeholder="10:30"
                />
              </div>
              <div className="form-group">
                <label>Ora fine</label>
                <input
                  value={aptForm.endTime}
                  onChange={e => setAptForm(f => ({ ...f, endTime: e.target.value }))}
                  onBlur={e => setAptForm(f => ({ ...f, endTime: formatTime(e.target.value) }))}
                  placeholder="12:00"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Stato</label>
              <select value={aptForm.status} onChange={e => setAptForm(f => ({ ...f, status: e.target.value }))}>
                {APT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea rows={2} value={aptForm.notes} onChange={e => setAptForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="trip-btn-secondary" onClick={() => setShowAptModal(false)}>Annulla</button>
              <button className="trip-btn-primary" onClick={saveApt}>{aptContext?.apt ? 'Salva' : 'Aggiungi'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
