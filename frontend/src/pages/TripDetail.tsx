import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { TripPdfUpload } from '../components/TripPdfUpload';
import { exportTripPdf } from '../utils/exportTripPdf';
import { exportTripExcel } from '../utils/exportTripExcel';
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

// ---- Constants ----
const FLIGHT_STATUSES = ['programmato', 'confermato'];
const HOTEL_STATUSES = ['programmato', 'confermato'];
const APT_STATUSES = ['programmato', 'confermato', 'in_attesa', 'sollecitato', 'da_modificare', 'rifiutato', 'fatto_report'];

const STATUS_LABELS: Record<string, string> = {
  programmato: 'Programmato',
  confermato: 'Confermato',
  in_attesa: 'In attesa',
  sollecitato: 'Sollecitato',
  da_modificare: 'Da modificare',
  rifiutato: 'Rifiutato',
  fatto_report: 'Fatto / Report',
};

const DAY_NAMES_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const LOCALE = 'it-IT';

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function formatTime(val: string): string {
  const d = val.replace(/\D/g, '');
  return d.length === 4 ? `${d.slice(0, 2)}:${d.slice(2)}` : val;
}
function fmtShort(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtMed(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}

// ---- Status Dropdown ----
interface StatusDropdownProps {
  status: string;
  statuses: string[];
  onChange: (s: string) => void;
  type?: 'flight' | 'hotel' | 'apt';
}
function StatusDropdown({ status, statuses, onChange, type = 'apt' }: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badgeCls = type === 'flight'
    ? (status === 'confermato' ? 'status-badge confermato' : 'status-badge programmato')
    : type === 'hotel'
    ? (status === 'confermato' ? 'status-badge confermato' : 'status-badge hotel-programmato')
    : `status-badge ${status}`;

  return (
    <div className="status-dropdown-wrap" ref={ref}>
      <button className={badgeCls} onClick={e => { e.stopPropagation(); setOpen(!open); }}>
        {STATUS_LABELS[status] || status}
      </button>
      {open && (
        <div className="status-dropdown-menu">
          {statuses.map(s => (
            <button
              key={s}
              className={`status-dropdown-item${s === status ? ' active' : ''}`}
              onClick={() => { onChange(s); setOpen(false); }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----
export const TripDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'list' | 'report'>('list');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const todayStr = new Date().toISOString().slice(0, 10);

  // PDF upload & export
  const [showPdfUpload, setShowPdfUpload] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Modals
  const [showEditTripModal, setShowEditTripModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [editingDay, setEditingDay] = useState<TravelDay | null>(null);
  const [showAptModal, setShowAptModal] = useState(false);
  const [aptContext, setAptContext] = useState<{ dayId: string; apt?: Appointment } | null>(null);

  // Inline flight form
  const [showFlightForm, setShowFlightForm] = useState<string | null>(null); // dayId
  const [flightForm, setFlightForm] = useState({ route: '', details: '', status: 'programmato' });
  const [editingFlight, setEditingFlight] = useState<{ dayId: string; flight: Flight } | null>(null);

  // Forms
  const [tripForm, setTripForm] = useState({ name: '', destination: '', startDate: '', endDate: '', notes: '' });
  const [dayForm, setDayForm] = useState({ date: '', location: '', hotel: '', hotelStatus: 'programmato', notes: '' });
  const [aptForm, setAptForm] = useState({ time: '', endTime: '', client: '', status: 'programmato', notes: '' });

  // Client autocomplete
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    apiService.getClients().then((res: any) => {
      if (res.success && res.data) setClients(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node))
        setShowExportMenu(false);
    };
    if (showExportMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const loadTrip = async () => {
    try {
      const res = await (apiService as any).getTrip(id);
      if (res.success) {
        setTrip(res.data);
        // Auto-expand today if present
        const today = res.data.days.find((d: TravelDay) => d.date === todayStr);
        if (today) setExpandedDays(new Set([today.id]));
      }
    } catch (e) {
      console.error('Failed to load trip:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) loadTrip(); }, [id]);

  const saveTrip = useCallback(async (updated: Trip) => {
    setTrip(updated);
    try {
      await (apiService as any).updateTrip(updated.id, { days: updated.days });
    } catch (e) {
      console.error('Save trip failed:', e);
    }
  }, []);

  const toggleDay = (dayId: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(dayId) ? next.delete(dayId) : next.add(dayId);
      return next;
    });
  };

  // ---- Day ops ----
  const updateDayField = (dayId: string, field: string, value: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id === dayId ? { ...d, [field]: value } : d) });
  };
  const deleteDay = (dayId: string) => {
    if (!trip || !confirm('Eliminare questo giorno?')) return;
    saveTrip({ ...trip, days: trip.days.filter(d => d.id !== dayId) });
  };
  const saveDay = () => {
    if (!trip || !dayForm.date) return;
    const d = new Date(dayForm.date + 'T00:00:00');
    if (editingDay) {
      saveTrip({ ...trip, days: trip.days.map(day => day.id === editingDay.id ? { ...day, ...dayForm } : day) });
    } else {
      const newDay: TravelDay = {
        id: `d${uid()}`, date: dayForm.date, dayOfWeek: DAY_NAMES_IT[d.getDay()],
        location: dayForm.location, hotel: dayForm.hotel,
        hotelStatus: dayForm.hotelStatus as TravelDay['hotelStatus'],
        notes: dayForm.notes, flights: [], appointments: [],
      };
      setExpandedDays(prev => new Set([...prev, newDay.id]));
      saveTrip({ ...trip, days: [...trip.days, newDay] });
    }
    setShowDayModal(false);
  };

  // ---- Flight ops ----
  const saveFlight = (dayId: string) => {
    if (!trip || !flightForm.route.trim()) return;
    let days;
    if (editingFlight && editingFlight.dayId === dayId) {
      days = trip.days.map(d => {
        if (d.id !== dayId) return d;
        return { ...d, flights: d.flights.map(f => f.id === editingFlight.flight.id ? { ...f, ...flightForm } : f) };
      });
      setEditingFlight(null);
    } else {
      days = trip.days.map(d => {
        if (d.id !== dayId) return d;
        return { ...d, flights: [...d.flights, { id: `f${uid()}`, ...flightForm } as Flight] };
      });
    }
    saveTrip({ ...trip, days });
    setFlightForm({ route: '', details: '', status: 'programmato' });
    setShowFlightForm(null);
  };
  const deleteFlight = (dayId: string, flightId: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id === dayId ? { ...d, flights: d.flights.filter(f => f.id !== flightId) } : d) });
  };
  const updateFlightStatus = (dayId: string, flightId: string, status: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id !== dayId ? d : { ...d, flights: d.flights.map(f => f.id === flightId ? { ...f, status: status as Flight['status'] } : f) }) });
  };

  // ---- Hotel ops ----
  const updateHotelStatus = (dayId: string, status: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id === dayId ? { ...d, hotelStatus: status as TravelDay['hotelStatus'] } : d) });
  };

  // ---- Appointment ops ----
  const saveApt = () => {
    if (!trip || !aptContext) return;
    const days = trip.days.map(d => {
      if (d.id !== aptContext.dayId) return d;
      if (aptContext.apt) {
        return { ...d, appointments: d.appointments.map(a => a.id === aptContext.apt!.id ? { ...a, ...aptForm } : a) };
      }
      return { ...d, appointments: [...d.appointments, { id: `a${uid()}`, ...aptForm }] };
    });
    saveTrip({ ...trip, days });
    setShowAptModal(false);
  };
  const deleteApt = (dayId: string, aptId: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id === dayId ? { ...d, appointments: d.appointments.filter(a => a.id !== aptId) } : d) });
  };
  const updateAptStatus = (dayId: string, aptId: string, status: string) => {
    if (!trip) return;
    saveTrip({ ...trip, days: trip.days.map(d => d.id !== dayId ? d : { ...d, appointments: d.appointments.map(a => a.id === aptId ? { ...a, status } : a) }) });
  };

  // ---- Trip meta ----
  const saveTripMeta = async () => {
    if (!trip) return;
    setTrip({ ...trip, ...tripForm });
    try {
      await (apiService as any).updateTrip(trip.id, {
        name: tripForm.name, destination: tripForm.destination,
        startDate: tripForm.startDate, endDate: tripForm.endDate, notes: tripForm.notes,
      });
    } catch (e) { console.error(e); }
    setShowEditTripModal(false);
  };
  const deleteTrip = async () => {
    if (!trip || !confirm('Eliminare questo viaggio?')) return;
    try { await (apiService as any).deleteTrip(trip.id); navigate('/trips'); } catch (e) { console.error(e); }
  };

  if (loading) return <div className="td-loading">Caricamento...</div>;
  if (!trip) return <div className="td-loading">Viaggio non trovato</div>;

  const sortedDays = [...trip.days].sort((a, b) => a.date.localeCompare(b.date));
  const totalFlights = trip.days.reduce((s, d) => s + d.flights.length, 0);
  const totalApts = trip.days.reduce((s, d) => s + d.appointments.length, 0);
  const hotelNames = [...new Set(trip.days.map(d => d.hotel).filter(Boolean))];
  const locations = [...new Set(trip.days.map(d => d.location).filter(Boolean))];

  // Hotel blocks for report
  const hotelBlocks: { hotel: string; checkIn: string; checkOut: string; nights: number; status: string }[] = [];
  let curHotel: typeof hotelBlocks[0] | null = null;
  for (const day of sortedDays.filter(d => d.hotel)) {
    if (curHotel && curHotel.hotel === day.hotel) { curHotel.checkOut = day.date; curHotel.nights++; }
    else { if (curHotel) hotelBlocks.push(curHotel); curHotel = { hotel: day.hotel, checkIn: day.date, checkOut: day.date, nights: 1, status: day.hotelStatus }; }
  }
  if (curHotel) hotelBlocks.push(curHotel);

  const statusCounts = trip.days.flatMap(d => d.appointments).reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="td-page">

      {/* ===== HEADER ===== */}
      <div className="td-header-bar">
        <button className="td-back-btn" onClick={() => navigate('/trips')}>← Viaggi</button>
        <div className="td-header-main">
          <div>
            <h1 className="td-title">{trip.name}</h1>
            <p className="td-subtitle">
              {new Date(trip.startDate + 'T00:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}
              {' — '}
              {new Date(trip.endDate + 'T00:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}{trip.days.length} giorni
            </p>
          </div>
          <div className="td-header-actions">
            <button className="td-btn-upload" onClick={() => setShowPdfUpload(true)}>↑ Carica PDF</button>
            <div className="td-export-wrap" ref={exportMenuRef}>
              <button className="td-btn-export" onClick={() => setShowExportMenu(v => !v)}>↓ Esporta ▾</button>
              {showExportMenu && (
                <div className="td-export-menu">
                  <button onClick={() => { exportTripPdf(trip); setShowExportMenu(false); }}>📄 Esporta PDF</button>
                  <button onClick={() => { exportTripExcel(trip); setShowExportMenu(false); }}>📊 Esporta Excel</button>
                </div>
              )}
            </div>
            <button className="td-icon-btn" title="Modifica" onClick={() => {
              setTripForm({ name: trip.name, destination: trip.destination || '', startDate: trip.startDate, endDate: trip.endDate, notes: trip.notes || '' });
              setShowEditTripModal(true);
            }}>✏</button>
            <button className="td-icon-btn danger" title="Elimina" onClick={deleteTrip}>🗑</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="td-tabs">
          <button className={`td-tab${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>
            📊 Panoramica
          </button>
          <button className={`td-tab${activeTab === 'list' ? ' active' : ''}`} onClick={() => setActiveTab('list')}>
            ☰ Lista
          </button>
          <button className={`td-tab${activeTab === 'report' ? ' active' : ''}`} onClick={() => setActiveTab('report')}>
            📋 Report
          </button>
        </div>
      </div>

      {/* ===== PANORAMICA ===== */}
      {activeTab === 'overview' && (
        <div className="td-overview">
          <div className="td-stats-grid">
            <div className="td-stat-card teal">
              <div className="td-stat-label">📍 Destinazioni</div>
              <div className="td-stat-value">{locations.length}</div>
            </div>
            <div className="td-stat-card blue">
              <div className="td-stat-label">✈ Voli</div>
              <div className="td-stat-value">{totalFlights}</div>
            </div>
            <div className="td-stat-card purple">
              <div className="td-stat-label">🏨 Hotel</div>
              <div className="td-stat-value">{hotelNames.length}</div>
            </div>
            <div className="td-stat-card green">
              <div className="td-stat-label">📅 Appuntamenti</div>
              <div className="td-stat-value">{totalApts}</div>
            </div>
          </div>

          <div className="td-overview-grid">
            <div className="td-overview-card">
              <h3 className="td-overview-card-title">Voli</h3>
              <div className="td-overview-list">
                {sortedDays.flatMap(d => d.flights.map(f => (
                  <div key={f.id} className="td-overview-item">
                    <span className="td-overview-date">{fmtMed(d.date)}</span>
                    <div>
                      <div className="td-overview-route">{f.route}</div>
                      <div className="td-overview-details">{f.details}</div>
                    </div>
                  </div>
                )))}
                {totalFlights === 0 && <span style={{ color: '#A09A96', fontSize: '0.8rem' }}>Nessun volo</span>}
              </div>
            </div>
            <div className="td-overview-card">
              <h3 className="td-overview-card-title">Stato Appuntamenti</h3>
              <div className="td-overview-list">
                {Object.entries(statusCounts).map(([s, count]) => (
                  <div key={s} className="td-overview-status-row">
                    <span>{STATUS_LABELS[s] || s}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {totalApts === 0 && <span style={{ color: '#A09A96', fontSize: '0.8rem' }}>Nessun appuntamento</span>}
              </div>
            </div>
          </div>

          {hotelNames.length > 0 && (
            <div className="td-overview-card">
              <h3 className="td-overview-card-title">Hotel</h3>
              <div className="td-hotels-wrap">
                {hotelNames.map(h => <span key={h} className="td-hotel-chip">{h}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== LISTA ===== */}
      {activeTab === 'list' && (
        <div className="td-list">
          {sortedDays.map(day => {
            const isToday = day.date === todayStr;
            const isExpanded = expandedDays.has(day.id);
            const dateObj = new Date(day.date + 'T00:00:00');
            const dayNum = dateObj.getDate();
            const monthStr = dateObj.toLocaleDateString(LOCALE, { month: 'short' }).toUpperCase();
            const dateStr = dateObj.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

            return (
              <div key={day.id} className={`td-day-card${isToday ? ' today' : ''}`}>
                {/* Header - click to expand */}
                <div className="td-day-header" onClick={() => toggleDay(day.id)}>
                  <div className={`td-date-box${isToday ? ' today' : ''}`}>
                    <span className="td-date-num">{dayNum}</span>
                    <span className="td-date-month">{monthStr}</span>
                  </div>
                  <div className="td-day-info">
                    <div className="td-day-location">
                      {day.location || '—'}
                      {isToday && <span className="td-today-badge">OGGI</span>}
                    </div>
                    <div className="td-day-summary">
                      <span>{dateStr}</span>
                      {day.flights.length > 0 && (
                        <span className="td-day-summary-item">
                          ✈ {day.flights[0].route}
                          {day.flights.length > 1 && <span className="td-extra-badge">+{day.flights.length - 1}</span>}
                        </span>
                      )}
                      {day.hotel && <span className="td-day-summary-item">🏨 {day.hotel}</span>}
                    </div>
                  </div>
                  <div className="td-day-header-right">
                    {day.appointments.length > 0 && (
                      <span className="td-apt-count-badge">🕐 {day.appointments.length}</span>
                    )}
                    <span className="td-chevron">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="td-day-body">
                    {/* Flights */}
                    {day.flights.map(f => (
                      <div key={f.id} className="td-flight-item">
                        <span className="td-flight-icon">✈</span>
                        <div className="td-flight-info">
                          <span className="td-flight-route">{f.route}</span>
                          {f.details && <span className="td-flight-details">{f.details}</span>}
                        </div>
                        <StatusDropdown status={f.status} statuses={FLIGHT_STATUSES} onChange={s => updateFlightStatus(day.id, f.id, s)} type="flight" />
                        <div className="td-item-actions">
                          <button className="td-icon-btn-sm" onClick={e => { e.stopPropagation(); setFlightForm({ route: f.route, details: f.details, status: f.status }); setEditingFlight({ dayId: day.id, flight: f }); setShowFlightForm(day.id); }}>✏</button>
                          <button className="td-icon-btn-sm danger" onClick={e => { e.stopPropagation(); deleteFlight(day.id, f.id); }}>✕</button>
                        </div>
                      </div>
                    ))}

                    {/* Inline flight form */}
                    {showFlightForm === day.id && (
                      <div className="td-flight-form">
                        <div className="td-flight-form-fields">
                          <input className="td-input" value={flightForm.route} onChange={e => setFlightForm(f => ({ ...f, route: e.target.value }))} placeholder="Tratta (es. BLQ-IST)" autoFocus />
                          <input className="td-input" value={flightForm.details} onChange={e => setFlightForm(f => ({ ...f, details: e.target.value }))} placeholder="Dettagli (es. TK1322 10:55)" />
                          <select className="td-select" value={flightForm.status} onChange={e => setFlightForm(f => ({ ...f, status: e.target.value }))}>
                            <option value="programmato">Programmato</option>
                            <option value="confermato">Confermato</option>
                          </select>
                        </div>
                        <div className="td-flight-form-actions">
                          <button className="td-link-btn" onClick={() => { setShowFlightForm(null); setEditingFlight(null); setFlightForm({ route: '', details: '', status: 'programmato' }); }}>Annulla</button>
                          <button className="td-small-btn-primary" onClick={() => saveFlight(day.id)}>Salva</button>
                        </div>
                      </div>
                    )}

                    {/* Hotel */}
                    {day.hotel && (
                      <div className="td-hotel-item">
                        <span className="td-hotel-icon">🏨</span>
                        <span className="td-hotel-name">{day.hotel}</span>
                        <StatusDropdown status={day.hotelStatus || 'confermato'} statuses={HOTEL_STATUSES} onChange={s => updateHotelStatus(day.id, s)} type="hotel" />
                      </div>
                    )}

                    {/* Notes */}
                    {day.notes && <div className="td-day-notes">{day.notes}</div>}

                    {/* Appointments */}
                    {day.appointments.length > 0 && (
                      <div className="td-apts-section">
                        <div className="td-apts-label">Appuntamenti</div>
                        {day.appointments.map(a => (
                          <div key={a.id} className="td-apt-item">
                            <div className="td-apt-time">{a.time || '—'}{a.endTime ? `–${a.endTime}` : ''}</div>
                            <div className="td-apt-main">
                              <div className="td-apt-client">{a.client}</div>
                              {a.notes && <div className="td-apt-notes">{a.notes}</div>}
                            </div>
                            <StatusDropdown status={a.status} statuses={APT_STATUSES} onChange={s => updateAptStatus(day.id, a.id, s)} type="apt" />
                            <a href={`/visits/new?client=${encodeURIComponent(a.client)}&date=${day.date}`} className="td-visit-link" title="Crea visita">+ Visita</a>
                            <div className="td-item-actions">
                              <button className="td-icon-btn-sm" onClick={e => { e.stopPropagation(); setAptContext({ dayId: day.id, apt: a }); setAptForm({ time: a.time, endTime: a.endTime, client: a.client, status: a.status, notes: a.notes }); setShowAptModal(true); }}>✏</button>
                              <button className="td-icon-btn-sm danger" onClick={e => { e.stopPropagation(); deleteApt(day.id, a.id); }}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Day actions */}
                    <div className="td-day-actions">
                      <button className="td-action-link teal" onClick={e => { e.stopPropagation(); setFlightForm({ route: '', details: '', status: 'programmato' }); setEditingFlight(null); setShowFlightForm(day.id); }}>+ Volo</button>
                      <button className="td-action-link teal" onClick={e => { e.stopPropagation(); setAptContext({ dayId: day.id }); setAptForm({ time: '', endTime: '', client: '', status: 'programmato', notes: '' }); setShowAptModal(true); }}>+ Appuntamento</button>
                      <button className="td-action-link muted" onClick={e => { e.stopPropagation(); setEditingDay(day); setDayForm({ date: day.date, location: day.location, hotel: day.hotel, hotelStatus: day.hotelStatus, notes: day.notes }); setShowDayModal(true); }}>✏ Modifica</button>
                      <button className="td-action-link red" onClick={e => { e.stopPropagation(); deleteDay(day.id); }}>🗑 Elimina</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button className="td-add-day-btn" onClick={() => { setEditingDay(null); setDayForm({ date: '', location: '', hotel: '', hotelStatus: 'programmato', notes: '' }); setShowDayModal(true); }}>
            + Aggiungi Giorno
          </button>
        </div>
      )}

      {/* ===== REPORT ===== */}
      {activeTab === 'report' && (
        <div className="td-report">
          {/* Itinerary */}
          <div className="td-report-card">
            <div className="td-report-card-header blue">Itinerario Completo</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="td-report-table">
                <colgroup>
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '230px' }} />
                  <col style={{ width: '190px' }} />
                  <col style={{ width: '340px' }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Data</th><th>Localita</th><th>Volo</th><th>Hotel</th><th>Appuntamenti</th><th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDays.map(day => (
                    <tr key={day.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#6AAED6', fontWeight: 600 }}>{fmtShort(day.date)}</td>
                      <td style={{ fontWeight: 600 }}>{day.location}</td>
                      <td>
                        {day.flights.map(f => (
                          <div key={f.id} className="td-rpt-row">
                            <div className="td-rpt-main">
                              <span className="td-report-route">{f.route}</span>
                              {f.details && <span className="td-report-muted"> {f.details}</span>}
                            </div>
                            <span className={`status-badge ${f.status}`}>{STATUS_LABELS[f.status]}</span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {day.hotel && (
                          <div className="td-rpt-row">
                            <span className="td-rpt-main" style={{ fontWeight: 500 }}>{day.hotel}</span>
                            <span className={`status-badge ${day.hotelStatus === 'confermato' ? 'confermato' : 'hotel-programmato'}`}>{STATUS_LABELS[day.hotelStatus]}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {day.appointments.map(a => (
                          <div key={a.id} className="td-rpt-row">
                            <span className="td-rpt-time">{a.time || '—'}{a.endTime ? `–${a.endTime}` : ''}</span>
                            <span className="td-rpt-client">{a.client}</span>
                            <span className={`status-badge ${a.status}`}>{STATUS_LABELS[a.status]}</span>
                          </div>
                        ))}
                      </td>
                      <td className="td-report-muted">{day.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Flights */}
          {totalFlights > 0 && (
            <div className="td-report-card">
              <div className="td-report-card-header teal">Voli</div>
              <div style={{ overflowX: 'auto' }}>
              <table className="td-report-table">
                <colgroup>
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '160px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead><tr><th>Data</th><th>Tratta</th><th>Dettagli</th><th>Stato</th></tr></thead>
                <tbody>
                  {sortedDays.flatMap(day => day.flights.map(f => (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(day.date)}</td>
                      <td className="td-report-route">{f.route}</td>
                      <td className="td-report-muted">{f.details}</td>
                      <td><span className={`status-badge ${f.status}`}>{STATUS_LABELS[f.status]}</span></td>
                    </tr>
                  )))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Hotels */}
          {hotelBlocks.length > 0 && (
            <div className="td-report-card">
              <div className="td-report-card-header purple">Hotel</div>
              <div style={{ overflowX: 'auto' }}>
              <table className="td-report-table">
                <colgroup>
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '60px' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead><tr><th>Hotel</th><th>Check-in</th><th>Check-out</th><th>Notti</th><th>Stato</th></tr></thead>
                <tbody>
                  {hotelBlocks.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h.hotel}</td>
                      <td>{fmtMed(h.checkIn)}</td>
                      <td>{fmtMed(h.checkOut)}</td>
                      <td>{h.nights}</td>
                      <td><span className={`status-badge ${h.status === 'confermato' ? 'confermato' : 'hotel-programmato'}`}>{STATUS_LABELS[h.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Appointments */}
          {totalApts > 0 && (
            <div className="td-report-card">
              <div className="td-report-card-header green">Appuntamenti</div>
              <div style={{ overflowX: 'auto' }}>
              <table className="td-report-table">
                <colgroup>
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '85px' }} />
                  <col style={{ width: '85px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead><tr><th>Data</th><th>Localita</th><th>Ora Inizio</th><th>Ora Fine</th><th>Cliente</th><th>Stato</th></tr></thead>
                <tbody>
                  {sortedDays.flatMap(day => day.appointments.map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(day.date)}</td>
                      <td>{day.location}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.time || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.endTime || ''}</td>
                      <td style={{ fontWeight: 600 }}>{a.client}</td>
                      <td><span className={`status-badge ${a.status}`}>{STATUS_LABELS[a.status]}</span></td>
                    </tr>
                  )))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== MODALS ===== */}

      {/* PDF Upload */}
      {showPdfUpload && (
        <TripPdfUpload
          trip={trip}
          onSave={(updatedDays: any[]) => saveTrip({ ...trip, days: updatedDays })}
          onClose={() => setShowPdfUpload(false)}
        />
      )}

      {/* Edit Trip */}
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

      {/* Appointment Modal */}
      {showAptModal && (
        <div className="modal-overlay" onClick={() => setShowAptModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{aptContext?.apt ? 'Modifica Appuntamento' : 'Nuovo Appuntamento'}</h2>
            <div className="form-group">
              <label>Cliente *</label>
              <div style={{ position: 'relative' }}>
                <input
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
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid rgba(160,154,150,0.3)', borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                    {clientSuggestions.map(c => (
                      <div key={c.id} onMouseDown={() => { setAptForm(f => ({ ...f, client: c.name })); setShowSuggestions(false); }}
                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', color: '#506A7E', borderBottom: '1px solid rgba(160,154,150,0.1)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F0EDE5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
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
                <input value={aptForm.time} onChange={e => setAptForm(f => ({ ...f, time: e.target.value }))} onBlur={e => setAptForm(f => ({ ...f, time: formatTime(e.target.value) }))} placeholder="10:30" />
              </div>
              <div className="form-group">
                <label>Ora fine</label>
                <input value={aptForm.endTime} onChange={e => setAptForm(f => ({ ...f, endTime: e.target.value }))} onBlur={e => setAptForm(f => ({ ...f, endTime: formatTime(e.target.value) }))} placeholder="12:00" />
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
