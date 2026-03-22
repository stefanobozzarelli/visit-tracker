import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company } from '../types';
import '../styles/ShowroomForm.css';

const AREA_OPTIONS = ['East China', 'North China', 'South China', 'Other'];

export const ShowroomForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Form state
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string>('none');
  const [type, setType] = useState<string>('');
  const [sqm, setSqm] = useState<string>('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [area, setArea] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [notes, setNotes] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load clients
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) {
          setClients(r.data.sort((a: Client, b: Client) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load companies
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) {
          setCompanies(r.data.sort((a: Company, b: Company) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load showroom in edit mode
      if (isEdit && id) {
        try {
          const r = await apiService.getShowroom(id);
          if (r.success && r.data) {
            const sr = r.data;
            setClientId(sr.client_id || '');
            setCompanyId(sr.company_id || '');
            setName(sr.name || '');
            setStatus(sr.status || 'none');
            setType(sr.type || '');
            setSqm(sr.sqm != null ? String(sr.sqm) : '');
            setAddress(sr.address || '');
            setCity(sr.city || '');
            setProvince(sr.province || '');
            setArea(sr.area || '');
            setLatitude(sr.latitude != null ? String(sr.latitude) : '');
            setLongitude(sr.longitude != null ? String(sr.longitude) : '');
            setNotes(sr.notes || '');
          }
        } catch {
          setError('Error loading showroom');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ---- Submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload: any = {
        client_id: clientId,
        company_id: companyId || undefined,
        name,
        status,
        type: type || undefined,
        sqm: sqm ? Number(sqm) : undefined,
        address: address || undefined,
        city: city || undefined,
        province: province || undefined,
        area: area || undefined,
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
        notes: notes || undefined,
      };

      if (isEdit && id) {
        const res = await apiService.updateShowroom(id, payload);
        if (res.success) {
          setSuccess('Showroom updated');
          navigate(`/showrooms/${id}`);
        } else {
          setError(res.error || 'Error updating showroom');
        }
      } else {
        const res = await apiService.createShowroom(payload);
        if (res.success && res.data) {
          setSuccess('Showroom created');
          navigate(`/showrooms/${res.data.id}`);
        } else {
          setError(res.error || 'Error creating showroom');
        }
      }
    } catch (err: any) {
      const serverError = err?.response?.data?.error;
      const message = serverError || err?.message || 'Error saving showroom';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="srf-page"><div className="srf-loading">Loading...</div></div>;
  }

  return (
    <div className="srf-page">
      {/* Header */}
      <div className="srf-header">
        <h1>{isEdit ? 'Edit Showroom' : 'New Showroom'}</h1>
        <button className="srf-back" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="srf-alert srf-alert-error">{error}</div>}
      {success && <div className="srf-alert srf-alert-success">{success}</div>}

      {/* Form */}
      <div className="srf-card">
        <form onSubmit={handleSubmit}>
          <div className="srf-row">
            <div className="form-group">
              <label>Client *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} required>
                <option value="">Select a client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
                <option value="">Select a supplier</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="srf-row">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Showroom name..."
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="none">None</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="opening">Opening</option>
              </select>
            </div>
          </div>

          <div className="srf-row">
            <div className="form-group">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="">Select type</option>
                <option value="shop_in_shop">Shop in Shop</option>
                <option value="dedicated">Dedicated</option>
              </select>
            </div>
            <div className="form-group">
              <label>SQM</label>
              <input
                type="number"
                value={sqm}
                onChange={e => setSqm(e.target.value)}
                placeholder="Square meters..."
                min="0"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Address</label>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              rows={2}
              placeholder="Full address..."
            />
          </div>

          <div className="srf-row srf-row-3">
            <div className="form-group">
              <label>City</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="City..."
              />
            </div>
            <div className="form-group">
              <label>Province</label>
              <input
                type="text"
                value={province}
                onChange={e => setProvince(e.target.value)}
                placeholder="Province..."
              />
            </div>
            <div className="form-group">
              <label>Area</label>
              <select value={area} onChange={e => setArea(e.target.value)}>
                <option value="">Select area</option>
                {AREA_OPTIONS.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="srf-row">
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={e => setLatitude(e.target.value)}
                placeholder="e.g. 31.2304"
              />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={e => setLongitude(e.target.value)}
                placeholder="e.g. 121.4737"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Additional notes..."
            />
          </div>

          {/* Form actions */}
          <div className="srf-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update Showroom' : 'Create Showroom'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShowroomForm;
