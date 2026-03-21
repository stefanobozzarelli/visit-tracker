import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { CompanyVisit } from '../types';
import '../styles/CrudPages.css';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';

export const CompanyVisitDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<CompanyVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadVisit = async () => {
      try {
        const res = await apiService.getCompanyVisitById(id);
        if (res.success && res.data) {
          setVisit(res.data);
        } else {
          setError('Meeting not found');
        }
      } catch (err) {
        setError('Error loading meeting');
      } finally {
        setLoading(false);
      }
    };
    loadVisit();
  }, [id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!visit) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate('/company-visits')} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Supplier Meeting Details</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Supplier</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{visit.company?.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Date</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{formatDate(visit.date)}</p>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Status</label>
          <p style={{ margin: 0, fontSize: '1rem' }}>{visit.status || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Subject</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.subject || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Participants</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.participants || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Notes</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.notes || '-'}</p>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/company-visits/${visit.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyVisitDetail;
