import React, { useState, useEffect, useMemo } from 'react';
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

const createColoredIcon = (color: string) => {
  return L.divIcon({
    className: 'sr-map-marker',
    html: `<div style="
      width: 24px; height: 24px; border-radius: 50% 50% 50% 0;
      background: ${color}; transform: rotate(-45deg);
      border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "><div style="
      width: 10px; height: 10px; border-radius: 50%;
      background: white; position: absolute;
      top: 5px; left: 5px; transform: rotate(45deg);
    "></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', closed: 'Closed', opening: 'Opening', none: 'None',
};

export const ShowroomMap: React.FC = () => {
  const navigate = useNavigate();
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterArea, setFilterArea] = useState('');

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
      if (!s.latitude || !s.longitude) return false;
      if (filterCompany && s.company_id !== filterCompany) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterArea && s.area !== filterArea) return false;
      return true;
    });
  }, [showrooms, filterCompany, filterStatus, filterArea]);

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

  const totalWithCoords = showrooms.filter(s => s.latitude && s.longitude).length;
  const totalWithoutCoords = showrooms.filter(s => !s.latitude || !s.longitude).length;

  if (loading) return <div className="sr-map-loading">Loading map...</div>;

  return (
    <div className="sr-map-page">
      <div className="sr-map-header">
        <div>
          <h1>Showroom Map</h1>
          <p className="sr-map-subtitle">
            {filtered.length} showroom{filtered.length !== 1 ? 's' : ''} on map
            {totalWithoutCoords > 0 && ` · ${totalWithoutCoords} without coordinates`}
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
      </div>

      <div className="sr-map-container">
        <MapContainer
          center={[31.2, 121.5]}
          zoom={4}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map(s => (
            <Marker
              key={s.id}
              position={[Number(s.latitude), Number(s.longitude)]}
              icon={createColoredIcon(companyColorMap.get(s.company_id || '') || '#999')}
            >
              <Popup>
                <div className="sr-map-popup">
                  <strong>{s.name}</strong>
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
          ))}
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
