import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { VisitReport } from '../types';
import '../styles/CrudPages.css';

export const ReportDetail: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<VisitReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [visitId, setVisitId] = useState<string>('');

  useEffect(() => {
    loadReport();
  }, [reportId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      if (!reportId) {
        setError('Report ID not found');
        return;
      }

      // Fetch report details - adjust endpoint as needed
      const response = await (apiService as any).getReportDetails?.(reportId);
      if (response?.success && response.data) {
        setReport(response.data);
        // Extract visitId from report or URL
        if (response.data.visit_id) {
          setVisitId(response.data.visit_id);
        }
      } else {
        // Fallback: extract from URL or show placeholder
        setError('Could not load report details');
      }
    } catch (err) {
      setError((err as Error).message || 'Error loading report');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileUpload = async (files: FileList) => {
    if (!files.length || !reportId || !visitId) {
      setError('Missing required information to upload file');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      for (const file of Array.from(files)) {
        // Get presigned URL from backend
        const presignedRes = await (apiService as any).fetch(
          `/api/visits/${visitId}/reports/${reportId}/upload`,
          'POST',
          {
            filename: file.name,
            fileSize: file.size,
          }
        );

        if (presignedRes.success && presignedRes.data) {
          const { uploadUrl, publicId } = presignedRes.data;

          // Upload file to Cloudinary using the URL from backend
          const formData = new FormData();
          formData.append('file', file);
          formData.append('public_id', publicId);
          formData.append('api_key', (window as any).CLOUDINARY_API_KEY || '');

          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
          });

          if (uploadResponse.ok) {
            console.log(`Successfully uploaded: ${file.name}`);
            // Reload report to show new attachment
            loadReport();
          } else {
            setError(`Failed to upload ${file.name}`);
          }
        } else {
          setError(presignedRes.error || 'Failed to get upload URL');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  if (isLoading) return <p>Caricamento...</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Allegati Report</h1>
        <button onClick={() => navigate(-1)} className="btn-secondary">
          ← Indietro
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-card">
        <h3>Carica File</h3>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            padding: '2rem',
            border: '2px dashed ' + (isDragging ? '#667eea' : '#ccc'),
            borderRadius: '4px',
            backgroundColor: isDragging ? '#f0f4ff' : '#fafafa',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s',
          }}
        >
          <p style={{ margin: '1rem 0' }}>
            📁 Trascina i file qui o clicca per sfogliare
          </p>
          <input
            type="file"
            multiple
            disabled={isUploading}
            onChange={(e) => handleFileUpload(e.target.files!)}
            style={{ cursor: 'pointer' }}
          />
          {isUploading && <p style={{ color: '#667eea' }}>Caricamento in corso...</p>}
        </div>

        <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
          Dimensione massima per file: 50MB
        </p>
      </div>

      <div className="form-card">
        <h3>File Caricati</h3>
        {report?.attachments && report.attachments.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {report.attachments.map((att) => (
              <li
                key={att.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  📄 {att.filename} ({Math.round(att.file_size / 1024)} KB)
                </span>
                <button
                  onClick={() => {
                    // Delete attachment logic here
                  }}
                  className="btn-danger"
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nessun file caricato</p>
        )}
      </div>
    </div>
  );
};
