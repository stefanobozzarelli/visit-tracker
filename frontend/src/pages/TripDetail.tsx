import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { TripPdfUpload } from '../components/TripPdfUpload';
import { exportTripPdf } from '../utils/exportTripPdf';
import { exportTripExcel } from '../utils/exportTripExcel';
import '../styles/TripDetail.css';

// ---- Types ----
interface TripHotel {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  status: 'programmato' | 'richiesto' | 'confermato';
}

interface Flight {
  id: string;
  route: string;
  details: string;
  status: 'programmato' | 'confermato';
  type: 'volo' | 'treno' | 'traghetto';
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
  hotels: TripHotel[];
}

// ---- Constants ----
const FLIGHT_STATUSES = ['programmato', 'confermato'];
const HOTEL_STATUSES = ['programmato', 'richiesto', 'confermato'];
const APT_STATUSES = ['programmato', 'confermato', 'in_attesa', 'sollecitato', 'da_modificare', 'rifiutato', 'fatto_report'];
const TRANSPORT_ICONS: Record<string, string> = { volo: '✈', treno: '🚆', traghetto: '⛴' };

const STATUS_LABELS: Record<string, string> = {
  programmato: 'Programmato',
  richiesto: 'Richiesto',
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
function checkOutDisplay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}
function extractTime(details: string): string {
  if (!details) return '99:99';
  const m = details.match(/\b(\d{1,2}:\d{2})\b/);
  if (!m) return '99:99';
  return m[1].length === 4 ? `0${m[1]}` : m[1];
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
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 3, left: r.left, width: r.width });
    }
    setOpen(v => !v);
  };

  const badgeCls = type === 'flight'
    ? (status === 'confermato' ? 'status-badge confermato' : 'status-badge programmato')
    : type === 'hotel'
    ? (status === 'confermato' ? 'status-badge confermato' : 'status-badge hotel-programmato')
    : `status-badge ${status}`;

  return (
    <div className="status-dropdown-wrap" ref={ref}>
      <button className={badgeCls} onClick={handleToggle}>
        {STATUS_LABELS[status] || status}
      </button>
      {open && (
        <div className="status-dropdown-menu" style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }}>
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
  const [highlightDayId, setHighlightDayId] = useState<string | null>(null);
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
  const [flightForm, setFlightForm] = useState({ route: '', details: '', status: 'programmato', type: 'volo' });
  const [editingFlight, setEditingFlight] = useState<{ dayId: string; flight: Flight } | null>(null);

  // Inline hotel form
  const [showHotelForm, setShowHotelForm] = useState<string | null>(null); // dayId (to pre-fill checkIn)
  const [hotelForm, setHotelForm] = useState({ name: '', checkIn: '', checkOut: '', status: 'programmato' });
  const [editingHotel, setEditingHotel] = useState<TripHotel | null>(null);

  // Forms
  const [tripForm, setTripForm] = useState({ name: '', destination: '', startDate: '', endDate: '', notes: '' });
  const [dayForm, setDayForm] = useState({ date: '', location: '', notes: '' });
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
        setTrip({ ...res.data, hotels: res.data.hotels || [] });
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
      await (apiService as any).updateTrip(updated.id, { days: updated.days, hotels: updated.hotels || [] });
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

  const goToDay = (dayId: string) => {
    setActiveTab('list');
    setExpandedDays(prev => new Set([...prev, dayId]));
    setHighlightDayId(dayId);
    setTimeout(() => {
      const el = document.getElementById(`trip-day-${dayId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    setTimeout(() => setHighlightDayId(null), 3000);
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
        location: dayForm.location,
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
    setFlightForm({ route: '', details: '', status: 'programmato', type: 'volo' });
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
  const getHotelsForDay = (date: string): TripHotel[] => {
    if (!trip) return [];
    return (trip.hotels || []).filter(h => h.checkIn <= date && h.checkOut >= date);
  };

  const saveHotel = () => {
    if (!trip || !hotelForm.name.trim() || !hotelForm.checkIn || !hotelForm.checkOut) return;
    let hotels: TripHotel[];
    if (editingHotel) {
      hotels = trip.hotels.map(h => h.id === editingHotel.id ? { ...h, ...hotelForm } : h);
    } else {
      hotels = [...(trip.hotels || []), { id: `h${uid()}`, ...hotelForm } as TripHotel];
    }
    saveTrip({ ...trip, hotels });
    setHotelForm({ name: '', checkIn: '', checkOut: '', status: 'programmato' });
    setShowHotelForm(null);
    setEditingHotel(null);
  };

  const deleteHotel = (hotelId: string) => {
    if (!trip) return;
    saveTrip({ ...trip, hotels: trip.hotels.filter(h => h.id !== hotelId) });
  };

  const updateHotelStatus = (hotelId: string, status: string) => {
    if (!trip) return;
    saveTrip({ ...trip, hotels: trip.hotels.map(h => h.id === hotelId ? { ...h, status: status as TripHotel['status'] } : h) });
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
  const hotelNames = [...new Set((trip.hotels || []).map(h => h.name).filter(Boolean))];
  const locations = [...new Set(trip.days.map(d => d.location).filter(Boolean))];

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
            <button className="td-btn-upload" onClick={() => setShowPdfUpload(true)}>↑ Carica file prenotazione</button>
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
              <div key={day.id} id={`trip-day-${day.id}`} className={`td-day-card${isToday ? ' today' : ''}${highlightDayId === day.id ? ' highlight' : ''}`}>
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
                          {TRANSPORT_ICONS[day.flights[0].type || 'volo']} {day.flights[0].route}
                          {day.flights.length > 1 && <span className="td-extra-badge">+{day.flights.length - 1}</span>}
                        </span>
                      )}
                      {getHotelsForDay(day.date).length > 0 && (
                        <span className="td-day-summary-item">🏨 {getHotelsForDay(day.date)[0].name}</span>
                      )}
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
                    {/* Hotels for this day */}
                    {getHotelsForDay(day.date).map(h => (
                      <div key={h.id} className="td-hotel-item">
                        <span className="td-hotel-icon">🏨</span>
                        <span className="td-hotel-name">{h.name}</span>
                        <span className="td-hotel-dates" style={{ fontSize: '0.75rem', color: '#A09A96' }}>
                          {fmtMed(h.checkIn)} → {checkOutDisplay(h.checkOut)}
                        </span>
                        <StatusDropdown status={h.status} statuses={HOTEL_STATUSES} onChange={s => updateHotelStatus(h.id, s)} type="hotel" />
                        <div className="td-item-actions">
                          <button className="td-icon-btn-sm" title="Modifica" onClick={e => { e.stopPropagation(); setEditingHotel(h); setHotelForm({ name: h.name, checkIn: h.checkIn, checkOut: h.checkOut, status: h.status }); setShowHotelForm(day.id); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                          </button>
                          <button className="td-icon-btn-sm danger" title="Elimina hotel" onClick={e => { e.stopPropagation(); deleteHotel(h.id); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Inline hotel form */}
                    {showHotelForm === day.id && (
                      <div className="td-flight-form">
                        <div className="td-flight-form-fields">
                          <input className="td-input" value={hotelForm.name} onChange={e => setHotelForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome hotel" autoFocus />
                          <input className="td-input" type="date" value={hotelForm.checkIn} onChange={e => setHotelForm(f => ({ ...f, checkIn: e.target.value }))} />
                          <input className="td-input" type="date" value={hotelForm.checkOut} onChange={e => setHotelForm(f => ({ ...f, checkOut: e.target.value }))} />
                          <select className="td-select" value={hotelForm.status} onChange={e => setHotelForm(f => ({ ...f, status: e.target.value as TripHotel['status'] }))}>
                            <option value="programmato">Programmato</option>
                            <option value="richiesto">Richiesto</option>
                            <option value="confermato">Confermato</option>
                          </select>
                        </div>
                        <div className="td-flight-form-actions">
                          <button className="td-link-btn" onClick={() => { setShowHotelForm(null); setEditingHotel(null); setHotelForm({ name: '', checkIn: '', checkOut: '', status: 'programmato' }); }}>Annulla</button>
                          <button className="td-small-btn-primary" onClick={saveHotel}>Salva</button>
                        </div>
                      </div>
                    )}

                    {/* Inline transport form */}
                    {showFlightForm === day.id && (
                      <div className="td-flight-form">
                        <div className="td-flight-form-fields">
                          <input className="td-input" value={flightForm.route} onChange={e => setFlightForm(f => ({ ...f, route: e.target.value }))} placeholder="Tratta (es. BLQ-IST)" autoFocus />
                          <input className="td-input" value={flightForm.details} onChange={e => setFlightForm(f => ({ ...f, details: e.target.value }))} placeholder="Dettagli (es. TK1322 10:55)" />
                          <select className="td-select" value={flightForm.type} onChange={e => setFlightForm(f => ({ ...f, type: e.target.value as Flight['type'] }))}>
                            <option value="volo">✈ Volo</option>
                            <option value="treno">🚆 Treno</option>
                            <option value="traghetto">⛴ Traghetto</option>
                          </select>
                          <select className="td-select" value={flightForm.status} onChange={e => setFlightForm(f => ({ ...f, status: e.target.value }))}>
                            <option value="programmato">Programmato</option>
                            <option value="confermato">Confermato</option>
                          </select>
                        </div>
                        <div className="td-flight-form-actions">
                          <button className="td-link-btn" onClick={() => { setShowFlightForm(null); setEditingFlight(null); setFlightForm({ route: '', details: '', status: 'programmato', type: 'volo' }); }}>Annulla</button>
                          <button className="td-small-btn-primary" onClick={() => saveFlight(day.id)}>Salva</button>
                        </div>
                      </div>
                    )}

                    {/* Trasporti + Appuntamenti unificati, ordinati per orario */}
                    {[
                      ...day.flights.map(f => ({ kind: 'flight' as const, sortTime: extractTime(f.details), f, a: null as Appointment | null })),
                      ...day.appointments.map(a => ({ kind: 'apt' as const, sortTime: a.time || '99:99', f: null as Flight | null, a })),
                    ].sort((x, y) => x.sortTime.localeCompare(y.sortTime)).map(item => item.f ? (
                      <div key={item.f.id} className="td-flight-item">
                        <span className="td-flight-icon">{TRANSPORT_ICONS[item.f.type || 'volo']}</span>
                        <div className="td-flight-info">
                          <span className="td-flight-route">{item.f.route}</span>
                          {item.f.details && <span className="td-flight-details">{item.f.details}</span>}
                        </div>
                        <StatusDropdown status={item.f.status} statuses={FLIGHT_STATUSES} onChange={s => updateFlightStatus(day.id, item.f!.id, s)} type="flight" />
                        <div className="td-item-actions">
                          <button className="td-icon-btn-sm" title="Modifica" onClick={e => { e.stopPropagation(); setFlightForm({ route: item.f!.route, details: item.f!.details, status: item.f!.status, type: item.f!.type || 'volo' }); setEditingFlight({ dayId: day.id, flight: item.f! }); setShowFlightForm(day.id); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                          </button>
                          <button className="td-icon-btn-sm danger" title="Elimina" onClick={e => { e.stopPropagation(); deleteFlight(day.id, item.f!.id); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
                          </button>
                        </div>
                      </div>
                    ) : item.a ? (
                      <div key={item.a.id} className="td-apt-item">
                        <div className="td-apt-time">{item.a.time || '—'}{item.a.endTime ? `–${item.a.endTime}` : ''}</div>
                        <div className="td-apt-main">
                          <div className="td-apt-client">{item.a.client}</div>
                          {item.a.notes && <div className="td-apt-notes">{item.a.notes}</div>}
                        </div>
                        {item.a.status === 'confermato' && (
                          <button
                            className="td-visit-link"
                            title="Crea visita e segna come Fatto/Report"
                            onClick={() => {
                              updateAptStatus(day.id, item.a!.id, 'fatto_report');
                              navigate(`/visits/new?client=${encodeURIComponent(item.a!.client)}&date=${day.date}`);
                            }}
                          >+ Visita</button>
                        )}
                        {item.a.status === 'fatto_report' && (
                          <span className="td-visit-done" title="Visita già registrata">✓ Report</span>
                        )}
                        <StatusDropdown status={item.a.status} statuses={APT_STATUSES} onChange={s => updateAptStatus(day.id, item.a!.id, s)} type="apt" />
                        <div className="td-item-actions">
                          <button className="td-icon-btn-sm" title="Modifica" onClick={e => { e.stopPropagation(); setAptContext({ dayId: day.id, apt: item.a! }); setAptForm({ time: item.a!.time, endTime: item.a!.endTime, client: item.a!.client, status: item.a!.status, notes: item.a!.notes }); setShowAptModal(true); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                          </button>
                          <button className="td-icon-btn-sm danger" title="Elimina" onClick={e => { e.stopPropagation(); deleteApt(day.id, item.a!.id); }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
                          </button>
                        </div>
                      </div>
                    ) : null)}

                    {/* Notes */}
                    {day.notes && <div className="td-day-notes">{day.notes}</div>}

                    {/* Day actions */}
                    <div className="td-day-actions">
                      <button className="td-action-link teal" onClick={e => { e.stopPropagation(); setFlightForm({ route: '', details: '', status: 'programmato', type: 'volo' }); setEditingFlight(null); setShowFlightForm(day.id); }}>+ Trasporto</button>
                      <button className="td-action-link purple" onClick={e => { e.stopPropagation(); setHotelForm({ name: '', checkIn: day.date, checkOut: day.date, status: 'programmato' }); setEditingHotel(null); setShowHotelForm(day.id); }}>+ Hotel</button>
                      <button className="td-action-link teal" onClick={e => { e.stopPropagation(); setAptContext({ dayId: day.id }); setAptForm({ time: '', endTime: '', client: '', status: 'programmato', notes: '' }); setShowAptModal(true); }}>+ Appuntamento</button>
                      <button className="td-action-link muted" onClick={e => { e.stopPropagation(); setEditingDay(day); setDayForm({ date: day.date, location: day.location, notes: day.notes }); setShowDayModal(true); }}>✏ Modifica</button>
                      <button className="td-action-link red" onClick={e => { e.stopPropagation(); deleteDay(day.id); }}>🗑 Elimina</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button className="td-add-day-btn" onClick={() => { setEditingDay(null); setDayForm({ date: '', location: '', notes: '' }); setShowDayModal(true); }}>
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
                  <col style={{ width: '95px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '480px' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Data</th><th>Localita</th><th>Trasporto</th><th>Hotel</th><th>Appuntamenti</th><th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDays.map(day => (
                    <tr key={day.id} onDoubleClick={() => goToDay(day.id)} style={{ cursor: 'pointer' }} title="Doppio click per aprire nella lista">
                      <td style={{ whiteSpace: 'nowrap', color: '#6AAED6', fontWeight: 600 }}>{fmtShort(day.date)}</td>
                      <td style={{ fontWeight: 600 }}>{day.location}</td>
                      <td>
                        {day.flights.map(f => (
                          <div key={f.id} className="td-rpt-row">
                            <div className="td-rpt-main">
                              <span style={{ marginRight: '4px' }}>{TRANSPORT_ICONS[f.type || 'volo']}</span>
                              <span className="td-report-route">{f.route}</span>
                              {f.details && <span className="td-report-muted"> {f.details}</span>}
                            </div>
                            <StatusDropdown status={f.status} statuses={FLIGHT_STATUSES} onChange={s => updateFlightStatus(day.id, f.id, s)} type="flight" />
                          </div>
                        ))}
                      </td>
                      <td>
                        {getHotelsForDay(day.date).map(h => (
                          <div key={h.id} className="td-rpt-row">
                            <span className="td-rpt-main" style={{ fontWeight: 500 }}>{h.name}</span>
                            <StatusDropdown status={h.status} statuses={HOTEL_STATUSES} onChange={s => updateHotelStatus(h.id, s)} type="hotel" />
                          </div>
                        ))}
                      </td>
                      <td>
                        {[...day.appointments].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')).map(a => (
                          <div key={a.id} className="td-rpt-row">
                            <span className="td-rpt-time">{a.time || '—'}{a.endTime ? `–${a.endTime}` : ''}</span>
                            <span className="td-rpt-client">{a.client}</span>
                            <StatusDropdown status={a.status} statuses={APT_STATUSES} onChange={s => updateAptStatus(day.id, a.id, s)} type="apt" />
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
              <div className="td-report-card-header teal">Trasporti</div>
              <div style={{ overflowX: 'auto' }}>
              <table className="td-report-table">
                <colgroup>
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '40px' }} />
                  <col style={{ width: '160px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead><tr><th>Data</th><th></th><th>Tratta</th><th>Dettagli</th><th>Stato</th></tr></thead>
                <tbody>
                  {sortedDays.flatMap(day => day.flights.map(f => (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(day.date)}</td>
                      <td style={{ fontSize: '1.1rem', textAlign: 'center' }}>{TRANSPORT_ICONS[f.type || 'volo']}</td>
                      <td className="td-report-route">{f.route}</td>
                      <td className="td-report-muted">{f.details}</td>
                      <td><StatusDropdown status={f.status} statuses={FLIGHT_STATUSES} onChange={s => updateFlightStatus(day.id, f.id, s)} type="flight" /></td>
                    </tr>
                  )))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Hotels */}
          {(trip.hotels || []).length > 0 && (
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
                  {(trip.hotels || []).sort((a,b) => a.checkIn.localeCompare(b.checkIn)).map(h => {
                    const nights = Math.round((new Date(h.checkOut).getTime() - new Date(h.checkIn).getTime()) / 86400000) + 1;
                    return (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{h.name}</td>
                        <td>{fmtMed(h.checkIn)}</td>
                        <td>{checkOutDisplay(h.checkOut)}</td>
                        <td>{nights}</td>
                        <td><StatusDropdown status={h.status} statuses={HOTEL_STATUSES} onChange={s => updateHotelStatus(h.id, s)} type="hotel" /></td>
                      </tr>
                    );
                  })}
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
                      <td><StatusDropdown status={a.status} statuses={APT_STATUSES} onChange={s => updateAptStatus(day.id, a.id, s)} type="apt" /></td>
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
          onSave={(updatedDays: any[], updatedHotels?: any[], newEndDate?: string) => saveTrip({ ...trip, days: updatedDays, hotels: updatedHotels ?? trip.hotels, ...(newEndDate ? { endDate: newEndDate } : {}) })}
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
