import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Company } from '../types';

export const CompanyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadCompany = async () => {
      try {
        const res = await apiService.getCompany(id);
        if (res.success && res.data) {
          setCompany(res.data);
        } else {
          setError('Supplier not found');
        }
      } catch (err) {
        setError('Error loading supplier');
      } finally {
        setLoading(false);
      }
    };
    loadCompany();
  }, [id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!company) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate('/companies')} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Supplier Details</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Name</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{company.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Country</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{company.country || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Industry</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{company.industry || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Rapporto</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{(company as any).rapporto || '-'}</p>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/companies/${company.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyDetail;
