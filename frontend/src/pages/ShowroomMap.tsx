import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiService } from '../services/api';
import { Showroom, Company } from '../types';
import '../styles/ShowroomMap.css';

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const SUPPLIER_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#34495E', '#E91E63', '#00BCD4',
  '#8BC34A', '#FF5722', '#607D8B', '#795548', '#CDDC39',
];

const createColoredIcon = (color: string, isGeocoded = false) => {
  const size = isGeocoded ? 18 : 24;
  const innerSize = isGeocoded ? 7 : 10;
  const innerOffset = isGeocoded ? 4 : 5;
  const border = isGeocoded ? '2px dashed white' : '2px solid white';
  return L.divIcon({
    className: 'sr-map-marker',
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50% 50% 50% 0;
      background: ${color}; transform: rotate(-45deg);
      border: ${border}; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      opacity: ${isGeocoded ? 0.8 : 1};
    "><div style="
      width: ${innerSize}px; height: ${innerSize}px; border-radius: 50%;
      background: white; position: absolute;
      top: ${innerOffset}px; left: ${innerOffset}px; transform: rotate(45deg);
    "></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', closed: 'Closed', opening: 'Opening', none: 'None',
};

// Geocoding cache: city name -> [lat, lng] or null
const geocodeCache = new Map<string, [number, number] | null>();

async function geocodeCity(city: string): Promise<[number, number] | null> {
  const key = city.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocodeCache.set(key, coords);
      return coords;
    }
  } catch {}
  geocodeCache.set(key, null);
  return null;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const ShowroomMap: React.FC = () => {
  const navigate = useNavigate();
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedCoords, setGeocodedCoords] = useState<Map<string, [number, number]>>(new Map());
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [mapLang, setMapLang] = useState<'local' | 'en'>('local');

  useEffect(() => {
    const load = async () => {
      try {
        const [srRes, coRes] = await Promise.all([
          apiService.getShowrooms(),
          apiService.getCompanies(),
        ]);
        if (srRes.success) setShowrooms(srRes.data || []);
        if (coRes.success) setCompanies(coRes.data || []);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  // Geocode showrooms without coordinates but with city
  const geocodeShowrooms = useCallback(async (srs: Showroom[]) => {
    const needsGeocoding = srs.filter(s => (!s.latitude || !s.longitude) && s.city);
    if (needsGeocoding.length === 0) return;

    setGeocoding(true);
    const newCoords = new Map<string, [number, number]>();

    // Group by city to avoid duplicate requests
    const cityGroups = new Map<string, string[]>();
    for (const s of needsGeocoding) {
      const cityKey = s.city!.toLowerCase().trim();
      if (!cityGroups.has(cityKey)) cityGroups.set(cityKey, []);
      cityGroups.get(cityKey)!.push(s.id);
    }

    for (const [cityKey, ids] of cityGroups) {
      // Find original city name (not lowercased)
      const originalCity = needsGeocoding.find(s => s.city!.toLowerCase().trim() === cityKey)!.city!;
      const coords = await geocodeCity(originalCity);
      if (coords) {
        for (const id of ids) {
          newCoords.set(id, coords);
        }
      }
      // Respect Nominatim rate limit: 1 request per second
      if (!geocodeCache.has(cityKey)) {
        await delay(1100);
      }
    }

    setGeocodedCoords(prev => {
      const merged = new Map(prev);
      newCoords.forEach((v, k) => merged.set(k, v));
      return merged;
    });
    setGeocoding(false);
  }, []);

  useEffect(() => {
    if (showrooms.length > 0) {
      geocodeShowrooms(showrooms);
    }
  }, [showrooms, geocodeShowrooms]);

  // Get coordinates for a showroom: GPS first, then geocoded
  const getCoords = useCallback((s: Showroom): [number, number] | null => {
    if (s.latitude && s.longitude) return [Number(s.latitude), Number(s.longitude)];
    return geocodedCoords.get(s.id) || null;
  }, [geocodedCoords]);

  const isGeocoded = useCallback((s: Showroom): boolean => {
    return (!s.latitude || !s.longitude) && geocodedCoords.has(s.id);
  }, [geocodedCoords]);

  const companyColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueCompanyIds = [...new Set(showrooms.map(s => s.company_id).filter(Boolean))];
    uniqueCompanyIds.forEach((id, i) => {
      map.set(id!, SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]);
    });
    return map;
  }, [showrooms]);

  const filtered = useMemo(() => {
    return showrooms.filter(s => {
      if (!getCoords(s)) return false;
      if (filterCompany && s.company_id !== filterCompany) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterArea && s.area !== filterArea) return false;
      return true;
    });
  }, [showrooms, filterCompany, filterStatus, filterArea, getCoords]);

  const areas = useMemo(() => {
    return [...new Set(showrooms.map(s => s.area).filter(Boolean))].sort();
  }, [showrooms]);

  const legendItems = useMemo(() => {
    const items: { id: string; name: string; color: string; count: number }[] = [];
    companyColorMap.forEach((color, companyId) => {
      const company = companies.find(c => c.id === companyId);
      const count = filtered.filter(s => s.company_id === companyId).length;
      if (count > 0 || !filterCompany) {
        items.push({ id: companyId, name: company?.name || 'Unknown', color, count });
      }
    });
    return items;
  }, [companyColorMap, companies, filtered, filterCompany]);

  const unmappable = showrooms.filter(s => !getCoords(s)).length;

  if (loading) return <div className="sr-map-loading">Loading map...</div>;

  return (
    <div className="sr-map-page">
      <div className="sr-map-header">
        <div>
          <h1>Showroom Map</h1>
          <p className="sr-map-subtitle">
            {filtered.length} showroom{filtered.length !== 1 ? 's' : ''} on map
            {geocoding && ' · Geocoding cities...'}
            {!geocoding && unmappable > 0 && ` · ${unmappable} without location`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => navigate('/showrooms')} className="sr-map-btn">
            ← List View
          </button>
        </div>
      </div>

      <div className="sr-map-toolbar">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className={`sr-map-filter${filterCompany ? ' active' : ''}`}>
          <option value="">All Suppliers</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={`sr-map-filter${filterStatus ? ' active' : ''}`}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="opening">Opening</option>
        </select>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
          className={`sr-map-filter${filterArea ? ' active' : ''}`}>
          <option value="">All Areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filterCompany || filterStatus || filterArea) && (
          <button onClick={() => { setFilterCompany(''); setFilterStatus(''); setFilterArea(''); }}
            className="sr-map-filter-clear">Clear</button>
        )}
        <button
          onClick={() => setMapLang(mapLang === 'local' ? 'en' : 'local')}
          className="sr-map-filter"
          style={{ marginLeft: 'auto', fontWeight: 600, minWidth: '90px' }}
          title={mapLang === 'local' ? 'Switch to English map labels' : 'Switch to local language labels'}
        >
          {mapLang === 'local' ? '🌐 English' : '🌐 Local'}
        </button>
      </div>

      <div className="sr-map-container">
        <MapContainer
          center={[25, 105]}
          zoom={3}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={mapLang}
            attribution={mapLang === 'en'
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }
            url={mapLang === 'en'
              ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
          />
          {filtered.map(s => {
            const coords = getCoords(s)!;
            const geocoded = isGeocoded(s);
            return (
              <Marker
                key={s.id}
                position={coords}
                icon={createColoredIcon(companyColorMap.get(s.company_id || '') || '#999', geocoded)}
              >
                <Popup>
                  <div className="sr-map-popup">
                    <strong>{s.name}</strong>
                    {geocoded && (
                      <div style={{ fontSize: '0.7rem', color: '#888', fontStyle: 'italic', marginTop: '2px' }}>
                        Approximate location (city)
                      </div>
                    )}
                    <div className="sr-map-popup-info">
                      <span>Client: {s.client?.name}</span>
                      <span>Supplier: {s.company?.name || '-'}</span>
                      <span>Status: {STATUS_LABELS[s.status] || s.status}</span>
                      {s.sqm && <span>SQM: {s.sqm}</span>}
                      {s.city && <span>City: {s.city}</span>}
                      {s.type && <span>Type: {s.type === 'shop_in_shop' ? 'Shop in Shop' : 'Dedicated'}</span>}
                    </div>
                    <button
                      className="sr-map-popup-link"
                      onClick={() => navigate(`/showrooms/${s.id}`)}
                    >
                      View Details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {legendItems.length > 0 && (
          <div className="sr-map-legend">
            <h4>Suppliers</h4>
            {legendItems.map(item => (
              <div
                key={item.id}
                className={`sr-map-legend-item${filterCompany === item.id ? ' active' : ''}`}
                onClick={() => setFilterCompany(filterCompany === item.id ? '' : item.id)}
              >
                <span className="sr-map-legend-dot" style={{ background: item.color }} />
                <span className="sr-map-legend-name">{item.name}</span>
                <span className="sr-map-legend-count">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
