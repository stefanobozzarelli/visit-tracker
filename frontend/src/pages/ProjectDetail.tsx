import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Project } from '../types';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const formatCurrency = (v?: number) => v != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : '-';

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadProject = async () => {
      try {
        const res = await apiService.getProject(id);
        if (res.success && res.data) {
          setProject(res.data);
        } else {
          setError('Project not found');
        }
      } catch (err) {
        setError('Error loading project');
      } finally {
        setLoading(false);
      }
    };
    loadProject();
  }, [id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!project) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate('/projects')} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Project Details</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Project #</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.project_number || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Project Name</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.project_name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Supplier</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.supplier?.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Client</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.client?.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Country</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.country || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Status</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{project.status || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Project Value</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{formatCurrency(project.project_value)}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Total Shipped</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{formatCurrency(project.total_value_shipped)}</p>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/projects/${project.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
