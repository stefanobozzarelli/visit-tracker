import React, { useState, useRef } from 'react';
import { config } from '../config';

interface ParsedFlight {
  date: string | null;
  route: string;
  details: string;
}
interface ParsedHotel {
  name: string;
  checkIn: string | null;
  checkOut: string | null;
}
interface ParseResult {
  type: 'flight' | 'hotel' | 'mixed' | 'unknown';
  flights: ParsedFlight[];
  hotels: ParsedHotel[];
  fileName: string;
  error?: string;
}

interface Props {
  trip: any;
  onSave: (updatedDays: any[], updatedHotels?: any[]) => void;
  onClose: () => void;
}

type ItemKey = string;

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.gif';
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

export const TripPdfUpload: React.FC<Props> = ({ trip, onSave, onClose }) => {
  const [results, setResults] = useState<ParseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingName, setLoadingName] = useState('');
  const [applied, setApplied] = useState<Set<ItemKey>>(new Set());
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set());
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File): Promise<ParseResult> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${config.API_BASE_URL}/parse-booking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Errore sconosciuto');
    return { ...json.data, fileName: file.name };
  };

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    const newResults: ParseResult[] = [];

    for (const file of Array.from(files)) {
      if (!ACCEPTED_MIME.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|webp|gif)$/i)) {
        newResults.push({ type: 'unknown', flights: [], hotels: [], fileName: file.name, error: 'Tipo file non supportato. Usa PDF, JPG, PNG o WEBP.' });
        continue;
      }
      setLoadingName(file.name);
      try {
        const result = await parseFile(file);
        newResults.push(result);
      } catch (err) {
        newResults.push({ type: 'unknown', flights: [], hotels: [], fileName: file.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Auto-select items that have dates
    const startIdx = results.length;
    const newSelected = new Set(selected);
    newResults.forEach((r, ri) => {
      r.flights.forEach((f, fi) => { if (f.date) newSelected.add(`r${startIdx + ri}-f${fi}`); });
      r.hotels.forEach((h, hi) => { if (h.checkIn) newSelected.add(`r${startIdx + ri}-h${hi}`); });
    });
    setSelected(newSelected);
    setResults(prev => [...prev, ...newResults]);
    setLoading(false);
    setLoadingName('');
  };

  const toggleSelect = (key: ItemKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const applySelected = () => {
    let updatedDays = [...trip.days];
    let updatedHotels = [...(trip.hotels || [])];
    const newApplied = new Set(applied);

    results.forEach((result, ri) => {
      result.flights.forEach((flight, fi) => {
        const key = `r${ri}-f${fi}`;
        if (!selected.has(key) || !flight.date) return;
        updatedDays = updatedDays.map((day: any) => {
          if (day.date === flight.date) {
            return {
              ...day,
              flights: [...day.flights, {
                id: 'f' + Date.now() + fi,
                route: flight.route,
                details: flight.details,
                status: 'confermato',
                type: 'volo',
              }],
              location: day.location || flight.route,
            };
          }
          return day;
        });
        newApplied.add(key);
      });

      result.hotels.forEach((hotel, hi) => {
        const key = `r${ri}-h${hi}`;
        if (!selected.has(key) || !hotel.checkIn) return;
        // Add to trip.hotels array (not day.hotel)
        updatedHotels = [...updatedHotels, {
          id: 'h' + Date.now() + hi,
          name: hotel.name,
          checkIn: hotel.checkIn,
          checkOut: hotel.checkOut || hotel.checkIn,
          status: 'confermato',
        }];
        newApplied.add(key);
      });
    });

    onSave(updatedDays, updatedHotels);
    setApplied(newApplied);
    setTimeout(() => { setResults([]); setApplied(new Set()); setSelected(new Set()); onClose(); }, 300);
  };

  const selectedCount = [...selected].filter(k => !applied.has(k)).length;
  const hasAnyData = results.some(r => r.flights.length > 0 || r.hotels.length > 0);

  const typeLabel = (type: string) => {
    if (type === 'flight') return 'Volo';
    if (type === 'hotel') return 'Hotel';
    if (type === 'mixed') return 'Volo + Hotel';
    return 'Non riconosciuto';
  };

  const fileIcon = (name: string) => {
    if (name.match(/\.pdf$/i)) return '📄';
    if (name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return '🖼️';
    return '📎';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <h2 className="modal-title">Carica Prenotazioni</h2>

        {/* Drop zone */}
        <div
          className={`pdf-dropzone ${dragging ? 'dragover' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        >
          <div className="pdf-dropzone-icon">📎</div>
          <p className="pdf-dropzone-text">Trascina file o clicca per selezionare</p>
          <p className="pdf-dropzone-hint">PDF, foto, screenshot — qualsiasi formato di prenotazione</p>
          <input ref={fileRef} type="file" accept={ACCEPTED} multiple style={{ display: 'none' }}
            onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>

        {/* Loading */}
        {loading && (
          <div className="pdf-loading">
            <span className="pdf-loading-spinner">⟳</span>
            Analizzando con AI{loadingName ? `: ${loadingName}` : '…'}
          </div>
        )}

        {/* Results */}
        {results.map((result, ri) => (
          <div key={ri} className="pdf-result-block">
            <div className="pdf-result-header">
              <span className="pdf-result-filename">{fileIcon(result.fileName)} {result.fileName}</span>
              {!result.error && (
                <span className={`pdf-result-type type-${result.type}`}>{typeLabel(result.type)}</span>
              )}
            </div>

            {result.error ? (
              <div className="pdf-no-results" style={{ color: 'var(--color-danger)' }}>
                ⚠️ {result.error}
              </div>
            ) : (
              <div className="pdf-result-items">
                {result.flights.map((flight, fi) => {
                  const key = `r${ri}-f${fi}`;
                  const isApplied = applied.has(key);
                  const isSel = selected.has(key);
                  const dateStr = flight.date
                    ? new Date(flight.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                    : null;
                  return (
                    <div key={fi}
                      className={`pdf-item flight ${isApplied ? 'applied' : isSel ? 'selected' : ''} ${!flight.date ? 'no-date' : ''}`}
                      onClick={() => !isApplied && flight.date && toggleSelect(key)}
                    >
                      <span className="pdf-item-check">{isApplied ? '✓' : isSel ? '☑' : '☐'}</span>
                      <span className="pdf-item-icon">✈</span>
                      <div className="pdf-item-info">
                        <div className="pdf-item-title">{flight.route || 'Rotta non trovata'}</div>
                        <div className="pdf-item-sub">{flight.details}</div>
                        {dateStr
                          ? <div className="pdf-item-date">{dateStr}</div>
                          : <div className="pdf-item-nodate">Data non trovata</div>
                        }
                      </div>
                    </div>
                  );
                })}

                {result.hotels.map((hotel, hi) => {
                  const key = `r${ri}-h${hi}`;
                  const isApplied = applied.has(key);
                  const isSel = selected.has(key);
                  const fmtDate = (d: string | null) => d
                    ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
                    : null;
                  return (
                    <div key={hi}
                      className={`pdf-item hotel ${isApplied ? 'applied' : isSel ? 'selected' : ''} ${!hotel.checkIn ? 'no-date' : ''}`}
                      onClick={() => !isApplied && hotel.checkIn && toggleSelect(key)}
                    >
                      <span className="pdf-item-check">{isApplied ? '✓' : isSel ? '☑' : '☐'}</span>
                      <span className="pdf-item-icon">🏨</span>
                      <div className="pdf-item-info">
                        <div className="pdf-item-title">{hotel.name}</div>
                        <div className="pdf-item-sub">
                          {hotel.checkIn && hotel.checkOut
                            ? `${fmtDate(hotel.checkIn)} — ${fmtDate(hotel.checkOut)}`
                            : hotel.checkIn
                              ? `Check-in: ${fmtDate(hotel.checkIn)}`
                              : <span className="pdf-item-nodate">Date non trovate</span>
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}

                {result.flights.length === 0 && result.hotels.length === 0 && (
                  <div className="pdf-no-results">Nessuna prenotazione trovata in questo file</div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Actions */}
        {hasAnyData && (
          <div className="pdf-actions">
            <span className="pdf-sel-count">
              {selectedCount > 0 ? `${selectedCount} selezionati` : 'Clicca per selezionare'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="trip-btn-secondary" onClick={() => { setResults([]); setApplied(new Set()); setSelected(new Set()); onClose(); }}>
                Chiudi
              </button>
              <button
                className="trip-btn-primary"
                onClick={applySelected}
                disabled={selectedCount === 0}
                style={selectedCount === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                Applica ({selectedCount})
              </button>
            </div>
          </div>
        )}

        {!hasAnyData && !loading && (
          <div className="modal-actions">
            <button className="trip-btn-secondary" onClick={onClose}>Chiudi</button>
          </div>
        )}
      </div>
    </div>
  );
};
