import React, { useState, useRef } from 'react';
import { parsePdf } from '../utils/pdfParser';
import type { PdfParseResult } from '../utils/pdfParser';

interface Props {
  trip: any;
  onSave: (updatedDays: any[]) => void;
  onClose: () => void;
}

type ItemKey = string;

export const TripPdfUpload: React.FC<Props> = ({ trip, onSave, onClose }) => {
  const [results, setResults] = useState<(PdfParseResult & { fileName: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<Set<ItemKey>>(new Set());
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set());
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    const newResults: (PdfParseResult & { fileName: string })[] = [];
    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        try {
          const result = await parsePdf(file);
          newResults.push({ ...result, fileName: file.name });
        } catch (err) {
          console.error('PDF parse error:', err);
          newResults.push({
            type: 'unknown', flights: [], hotels: [],
            rawText: `ERRORE: ${err instanceof Error ? err.message : String(err)}`,
            fileName: file.name,
          });
        }
      }
    }
    // Auto-select items with dates
    const newSelected = new Set(selected);
    const startIdx = results.length;
    newResults.forEach((r, ri) => {
      r.flights.forEach((f, fi) => { if (f.date) newSelected.add(`r${startIdx + ri}-f${fi}`); });
      r.hotels.forEach((h, hi) => { if (h.checkIn) newSelected.add(`r${startIdx + ri}-h${hi}`); });
    });
    setSelected(newSelected);
    setResults(prev => [...prev, ...newResults]);
    setLoading(false);
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
    const newApplied = new Set(applied);

    results.forEach((result, ri) => {
      result.flights.forEach((flight, fi) => {
        const key = `r${ri}-f${fi}`;
        if (!selected.has(key) || !flight.date) return;
        updatedDays = updatedDays.map((day: any) => {
          if (day.date === flight.date) {
            return {
              ...day,
              flights: [...day.flights, { id: 'f' + Date.now() + fi, route: flight.route, details: flight.details, status: 'confermato' }],
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
        const checkIn = new Date(hotel.checkIn + 'T00:00:00');
        const checkOut = hotel.checkOut ? new Date(hotel.checkOut + 'T00:00:00') : null;
        updatedDays = updatedDays.map((day: any) => {
          const dayDate = new Date(day.date + 'T00:00:00');
          const inRange = checkOut ? dayDate >= checkIn && dayDate < checkOut : dayDate.getTime() === checkIn.getTime();
          return inRange ? { ...day, hotel: hotel.name } : day;
        });
        newApplied.add(key);
      });
    });

    onSave(updatedDays);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <h2 className="modal-title">Carica Prenotazioni PDF</h2>

        {/* Drop zone */}
        <div
          className={`pdf-dropzone ${dragging ? 'dragover' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        >
          <div className="pdf-dropzone-icon">📄</div>
          <p className="pdf-dropzone-text">Trascina qui i PDF delle prenotazioni o clicca per selezionarli</p>
          <p className="pdf-dropzone-hint">Voli, hotel, conferme prenotazione</p>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>

        {/* Loading */}
        {loading && (
          <div className="pdf-loading">
            <span className="pdf-loading-spinner">⟳</span>
            Analizzando PDF...
          </div>
        )}

        {/* Results */}
        {results.map((result, ri) => (
          <div key={ri} className="pdf-result-block">
            <div className="pdf-result-header">
              <span className="pdf-result-filename">📄 {result.fileName}</span>
              <span className={`pdf-result-type type-${result.type}`}>{typeLabel(result.type)}</span>
            </div>
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
                        {hotel.checkIn && `Check-in: ${hotel.checkIn}`}
                        {hotel.checkOut && ` — Check-out: ${hotel.checkOut}`}
                        {!hotel.checkIn && <span className="pdf-item-nodate">Data non trovata</span>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {result.flights.length === 0 && result.hotels.length === 0 && (
                <div className="pdf-no-results">
                  Nessuna prenotazione trovata in questo file
                  {result.rawText && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--color-accent)', fontSize: 11 }}>Mostra testo estratto</summary>
                      <pre style={{ marginTop: 4, padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 4, fontSize: 10, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                        {result.rawText.substring(0, 1500)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
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
