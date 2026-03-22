import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Showroom, ShowroomPhotoAlbum, ShowroomPhoto, ShowroomStatus } from '../types';
import '../styles/ShowroomDetail.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const STATUS_CONFIG: Record<ShowroomStatus, { label: string; color: string }> = {
  open:    { label: 'Open',    color: '#5B8A65' },
  closed:  { label: 'Closed',  color: '#8A7F72' },
  opening: { label: 'Opening', color: '#B09840' },
  none:    { label: 'None',    color: '#b0b0b0' },
};

const TYPE_LABELS: Record<string, string> = {
  shop_in_shop: 'Shop in Shop',
  dedicated: 'Dedicated',
};

export const ShowroomDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [showroom, setShowroom] = useState<Showroom | null>(null);
  const [albums, setAlbums] = useState<ShowroomPhotoAlbum[]>([]);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

  // Status dropdown
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // New album form
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [newAlbumDate, setNewAlbumDate] = useState('');
  const [newAlbumTitle, setNewAlbumTitle] = useState('');

  // Edit album
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editAlbumDate, setEditAlbumDate] = useState('');
  const [editAlbumTitle, setEditAlbumTitle] = useState('');

  // Photo upload
  const [uploadingAlbumId, setUploadingAlbumId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // UI
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { loadData(); }, [id]);

  // Close status dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpen]);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const r = await apiService.getShowroom(id);
      if (r.success && r.data) {
        setShowroom(r.data);
        // Albums may come embedded or need separate fetch
        if (r.data.albums) {
          setAlbums(sortAlbums(r.data.albums));
        } else {
          await loadAlbums();
        }
      }
    } catch {
      setError('Error loading showroom');
    } finally {
      setLoading(false);
    }
  };

  const loadAlbums = async () => {
    if (!id) return;
    try {
      const r = await apiService.getShowroomAlbums(id);
      if (r.success && r.data) {
        setAlbums(sortAlbums(Array.isArray(r.data) ? r.data : []));
      }
    } catch {}
  };

  const sortAlbums = (arr: ShowroomPhotoAlbum[]) =>
    [...arr].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ---- Status change ----
  const handleStatusChange = async (newStatus: ShowroomStatus) => {
    if (!id) return;
    setStatusOpen(false);
    try {
      const res = await apiService.updateShowroom(id, { status: newStatus });
      if (res.success) {
        setShowroom(prev => prev ? { ...prev, status: newStatus } : prev);
        setSuccess('Status updated');
      } else {
        setError(res.error || 'Error updating status');
      }
    } catch {
      setError('Error updating status');
    }
  };

  // ---- Delete showroom ----
  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Delete this showroom? This cannot be undone.')) return;
    try {
      await apiService.deleteShowroom(id);
      navigate('/showrooms');
    } catch {
      setError('Error deleting showroom');
    }
  };

  // ---- Album CRUD ----
  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newAlbumDate) return;
    try {
      const res = await apiService.createShowroomAlbum(id, {
        date: newAlbumDate,
        title: newAlbumTitle || undefined,
      });
      if (res.success) {
        setSuccess('Album created');
        setShowNewAlbum(false);
        setNewAlbumDate('');
        setNewAlbumTitle('');
        await loadAlbums();
      } else {
        setError(res.error || 'Error creating album');
      }
    } catch {
      setError('Error creating album');
    }
  };

  const handleUpdateAlbum = async (albumId: string) => {
    if (!id) return;
    try {
      const res = await apiService.updateShowroomAlbum(id, albumId, {
        date: editAlbumDate,
        title: editAlbumTitle || undefined,
      });
      if (res.success) {
        setSuccess('Album updated');
        setEditingAlbumId(null);
        await loadAlbums();
      } else {
        setError(res.error || 'Error updating album');
      }
    } catch {
      setError('Error updating album');
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!id) return;
    if (!window.confirm('Delete this album and all its photos?')) return;
    try {
      await apiService.deleteShowroomAlbum(id, albumId);
      setSuccess('Album deleted');
      await loadAlbums();
    } catch {
      setError('Error deleting album');
    }
  };

  // ---- Photo operations ----
  const handlePhotoUpload = async (albumId: string, files: FileList | null) => {
    if (!id || !files || files.length === 0) return;
    setUploadingAlbumId(albumId);
    try {
      for (let i = 0; i < files.length; i++) {
        await apiService.uploadShowroomPhoto(id, albumId, files[i]);
      }
      setSuccess(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`);
      await loadAlbums();
    } catch {
      setError('Error uploading photos');
    } finally {
      setUploadingAlbumId(null);
      const input = fileInputRefs.current[albumId];
      if (input) input.value = '';
    }
  };

  const handleDownloadPhoto = async (albumId: string, photoId: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadShowroomPhoto(id, albumId, photoId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Error downloading photo');
    }
  };

  const handleDeletePhoto = async (albumId: string, photoId: string) => {
    if (!id) return;
    if (!window.confirm('Delete this photo?')) return;
    try {
      await apiService.deleteShowroomPhoto(id, albumId, photoId);
      setSuccess('Photo deleted');
      await loadAlbums();
    } catch {
      setError('Error deleting photo');
    }
  };

  const toggleAlbum = (albumId: string) => {
    setExpandedAlbums(prev => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  };

  const startEditAlbum = (album: ShowroomPhotoAlbum) => {
    setEditingAlbumId(album.id);
    setEditAlbumDate(album.date ? album.date.substring(0, 10) : '');
    setEditAlbumTitle(album.title || '');
  };

  // ---- Render ----
  if (loading) return <div className="srd-page"><div className="srd-loading">Loading...</div></div>;
  if (!showroom) return <div className="srd-page"><div className="srd-loading">Showroom not found</div></div>;

  const statusCfg = STATUS_CONFIG[showroom.status] || STATUS_CONFIG.none;

  return (
    <div className="srd-page">
      {/* Header */}
      <div className="srd-header">
        <div className="srd-header-left">
          <button className="srd-back" onClick={() => navigate('/showrooms')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back to Showrooms
          </button>
          <h1>{showroom.name}</h1>
          <div className="srd-header-meta">
            {/* Status badge dropdown */}
            <div ref={statusRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className={`srd-status-pill status-${showroom.status}`}
                onClick={() => setStatusOpen(!statusOpen)}
              >
                <span className="srd-status-dot" />
                {statusCfg.label}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {statusOpen && (
                <div className="srd-status-dropdown">
                  {(Object.keys(STATUS_CONFIG) as ShowroomStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`srd-status-option${s === showroom.status ? ' selected' : ''}`}
                      onClick={() => handleStatusChange(s)}
                    >
                      <span className="srd-status-dot" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="srd-header-actions">
          <button className="srd-btn" onClick={() => navigate(`/showrooms/${id}/edit`)}>Edit</button>
          {isAdmin && (
            <button className="srd-btn danger" onClick={handleDelete}>Delete</button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="srd-alert srd-alert-error">{error}</div>}
      {success && <div className="srd-alert srd-alert-success">{success}</div>}

      {/* Info section */}
      <div className="srd-info-card">
        <h3>Details</h3>
        <div className="srd-info-grid">
          <div className="srd-info-item">
            <span className="srd-info-label">Client</span>
            <span className="srd-info-value">
              {showroom.client ? (
                <button
                  type="button"
                  className="srd-link"
                  onClick={() => navigate(`/contacts/${showroom.client_id}`)}
                >
                  {showroom.client.name}
                </button>
              ) : showroom.client_id}
            </span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">Supplier</span>
            <span className="srd-info-value">{showroom.company?.name || '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">Type</span>
            <span className="srd-info-value">{showroom.type ? (TYPE_LABELS[showroom.type] || showroom.type) : '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">SQM</span>
            <span className="srd-info-value">{showroom.sqm ?? '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">Address</span>
            <span className="srd-info-value">{showroom.address || '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">City</span>
            <span className="srd-info-value">{showroom.city || '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">Province</span>
            <span className="srd-info-value">{showroom.province || '-'}</span>
          </div>
          <div className="srd-info-item">
            <span className="srd-info-label">Area</span>
            <span className="srd-info-value">{showroom.area || '-'}</span>
          </div>
          {(showroom.latitude != null || showroom.longitude != null) && (
            <div className="srd-info-item">
              <span className="srd-info-label">Coordinates</span>
              <span className="srd-info-value">{showroom.latitude}, {showroom.longitude}</span>
            </div>
          )}
          {showroom.notes && (
            <div className="srd-info-item srd-info-full">
              <span className="srd-info-label">Notes</span>
              <span className="srd-info-value srd-notes-text">{showroom.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Albums section */}
      <div className="srd-albums-section">
        <div className="srd-albums-header">
          <h3>Photo Albums ({albums.length})</h3>
          <button
            className="srd-btn-new-album"
            onClick={() => setShowNewAlbum(!showNewAlbum)}
          >
            + New Album
          </button>
        </div>

        {/* New album inline form */}
        {showNewAlbum && (
          <form className="srd-album-form" onSubmit={handleCreateAlbum}>
            <input
              type="date"
              value={newAlbumDate}
              onChange={e => setNewAlbumDate(e.target.value)}
              required
              className="srd-album-input"
            />
            <input
              type="text"
              value={newAlbumTitle}
              onChange={e => setNewAlbumTitle(e.target.value)}
              placeholder="Album title (optional)"
              className="srd-album-input"
            />
            <button type="submit" className="srd-album-save">Create</button>
            <button type="button" className="srd-album-cancel" onClick={() => { setShowNewAlbum(false); setNewAlbumDate(''); setNewAlbumTitle(''); }}>Cancel</button>
          </form>
        )}

        {/* Album list */}
        {albums.length === 0 && !showNewAlbum && (
          <div className="srd-empty">No photo albums yet</div>
        )}

        {albums.map(album => {
          const isExpanded = expandedAlbums.has(album.id);
          const photos = album.photos || [];
          const isEditing = editingAlbumId === album.id;

          return (
            <div key={album.id} className={`srd-album-card${isExpanded ? ' expanded' : ''}`}>
              <div className="srd-album-header" onClick={() => toggleAlbum(album.id)}>
                <div className="srd-album-info">
                  <svg
                    className={`srd-album-chevron${isExpanded ? ' open' : ''}`}
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="srd-album-date">{formatDate(album.date)}</span>
                  {album.title && <span className="srd-album-title">{album.title}</span>}
                  <span className="srd-album-count">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="srd-album-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="srd-album-action-btn"
                    onClick={() => startEditAlbum(album)}
                    title="Edit album"
                  >
                    Edit
                  </button>
                  <button
                    className="srd-album-action-btn danger"
                    onClick={() => handleDeleteAlbum(album.id)}
                    title="Delete album"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Edit album inline form */}
              {isEditing && (
                <div className="srd-album-edit-form" onClick={e => e.stopPropagation()}>
                  <input
                    type="date"
                    value={editAlbumDate}
                    onChange={e => setEditAlbumDate(e.target.value)}
                    className="srd-album-input"
                  />
                  <input
                    type="text"
                    value={editAlbumTitle}
                    onChange={e => setEditAlbumTitle(e.target.value)}
                    placeholder="Album title"
                    className="srd-album-input"
                  />
                  <button className="srd-album-save" onClick={() => handleUpdateAlbum(album.id)}>Save</button>
                  <button className="srd-album-cancel" onClick={() => setEditingAlbumId(null)}>Cancel</button>
                </div>
              )}

              {/* Album content (expanded) */}
              {isExpanded && (
                <div className="srd-album-content">
                  {/* Upload drop zone */}
                  <div
                    className="srd-photo-dropzone"
                    onClick={() => fileInputRefs.current[album.id]?.click()}
                  >
                    <input
                      ref={el => { fileInputRefs.current[album.id] = el; }}
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => handlePhotoUpload(album.id, e.target.files)}
                    />
                    {uploadingAlbumId === album.id ? (
                      <span>Uploading...</span>
                    ) : (
                      <span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Click to upload photos
                      </span>
                    )}
                  </div>

                  {/* Photo grid */}
                  {photos.length > 0 ? (
                    <div className="srd-photo-grid">
                      {photos.map(photo => (
                        <div key={photo.id} className="srd-photo-card">
                          <div className="srd-photo-info">
                            <span
                              className="srd-photo-name"
                              onClick={() => handleDownloadPhoto(album.id, photo.id)}
                              title="Click to download"
                            >
                              {photo.filename}
                            </span>
                            <span className="srd-photo-size">{formatFileSize(photo.file_size)}</span>
                          </div>
                          <button
                            className="srd-photo-delete"
                            onClick={() => handleDeletePhoto(album.id, photo.id)}
                            title="Delete photo"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="srd-empty-photos">No photos in this album</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ShowroomDetail;
