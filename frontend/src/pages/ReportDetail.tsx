import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { VisitReport } from '../types';
import '../styles/CrudPages.css';

export const ReportDetail: React.FC = () => {
  const { reportId, visitId } = useParams<{ reportId: string; visitId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<VisitReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      if (!reportId || !visitId) {
        setError('Report ID or Visit ID not found');
        return;
      }

      // Fetch the visit with all its reports and attachments
      const visitRes = await apiService.getVisit(visitId);
      if (visitRes.success && visitRes.data) {
        const visit = visitRes.data;
        // Find the specific report
        const foundReport = visit.reports?.find((r: any) => r.id === reportId);
        if (foundReport) {
          setReport(foundReport);
          setError('');
        } else {
          setError('Report not found in visit');
        }
      } else {
        setError(visitRes.error || 'Failed to load visit');
      }
      setIsLoading(false);
    } catch (err) {
      setError((err as Error).message || 'Error loading report');
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
        try {
          // Get presigned URL and signature from backend
          const presignedRes = await apiService.getPresignedUrl(
            visitId,
            reportId,
            file.name,
            file.size
          );

          if (presignedRes.success && presignedRes.data) {
            const { uploadUrl, publicId, timestamp, signature, apiKey } = presignedRes.data;

            // Upload file to Cloudinary with proper authentication
            const formData = new FormData();
            formData.append('file', file);
            formData.append('public_id', publicId);
            formData.append('api_key', apiKey);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);

            console.log('Uploading to:', uploadUrl);
            console.log('FormData contents:', { publicId, timestamp, signature: signature.substring(0, 20) + '...' });

            const uploadResponse = await fetch(uploadUrl, {
              method: 'POST',
              body: formData,
            });

            console.log('Upload response status:', uploadResponse.status, uploadResponse.statusText);

            if (uploadResponse.ok) {
              console.log(`Successfully uploaded: ${file.name}`);
            } else {
              const errorData = await uploadResponse.text();
              console.error('Upload error response:', errorData);
              setError(`Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorData.substring(0, 100)}`);
            }
          } else {
            setError(presignedRes.error || 'Failed to get upload URL');
          }
        } catch (fileErr) {
          console.error(`Error uploading ${file.name}:`, fileErr);
          setError(`Error uploading ${file.name}: ${(fileErr as Error).message}`);
        }
      }
      // Reload report after all uploads
      loadReport();
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
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      // Open in new window
                      window.open(`/api/visits/${visitId}/reports/${reportId}/attachments/${att.id}/download`, '_blank');
                    }}
                    className="btn-primary"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    Apri
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        // Fetch with redirect to download as blob
                        const response = await fetch(`/api/visits/${visitId}/reports/${reportId}/attachments/${att.id}/download`, {
                          redirect: 'follow'
                        });
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = att.filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        alert(`Errore: ${(err as Error).message}`);
                      }
                    }}
                    className="btn-primary"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    ⬇️ Scarica
                  </button>
                  <button
                    onClick={() => {
                      // Delete attachment logic here
                    }}
                    className="btn-danger"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    Elimina
                  </button>
                </div>
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
