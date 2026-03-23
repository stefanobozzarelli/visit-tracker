import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Project } from '../types';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const formatCurrency = (v?: number) => v != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : '-';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '2rem' }}>
    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', marginTop: 0, borderBottom: '2px solid #007bff', paddingBottom: '0.5rem' }}>{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>{label}</label>
    <p style={{ margin: 0, fontSize: '1rem' }}>{value || '-'}</p>
  </div>
);

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadProject = async () => {
      try {
        const res = await apiService.getProject(id);
        if (res.success && res.data) {
          setProject(res.data);
          try {
            const offersRes = await apiService.getOffers({ project_id: id });
            if (offersRes.success && offersRes.data) {
              setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
            }
          } catch {}
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
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Project Details - {project.project_name || 'Untitled'}</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        {/* Basic Information */}
        <Section title="Basic Information">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <Field label="Project #" value={project.project_number || ''} />
            <Field label="Status" value={project.status || ''} />
            <Field label="Registration Date" value={formatDate(project.registration_date)} />
          </div>
        </Section>

        {/* Parties */}
        <Section title="Parties">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <Field label="Client" value={project.client?.name || ''} />
            <Field label="Supplier" value={project.supplier?.name || ''} />
            <Field label="Country" value={project.country || ''} />
            <Field label="Architect / Designer" value={project.architect_designer || ''} />
            <Field label="Developer" value={project.developer || ''} />
            <Field label="Contractor" value={project.contractor || ''} />
          </div>
        </Section>

        {/* Project Details */}
        <Section title="Project Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            <Field label="Project Address" value={project.project_address || ''} />
            <Field label="Project Type" value={project.project_type || ''} />
            <Field label="Detail of Project Type" value={project.detail_of_project_type || ''} />
            <Field label="Designated Area" value={project.designated_area || ''} />
          </div>
        </Section>

        {/* Items & Quantities */}
        {(project.item || project.quantity) && (
          <Section title="Items & Quantities">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <Field label="Item" value={project.item || ''} />
              <Field label="Quantity" value={project.quantity || ''} />
            </div>
          </Section>
        )}

        {/* Project Development & Registration */}
        <Section title="Status & Development">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <Field label="Project Development" value={project.project_development || ''} />
            <Field label="Project Registration" value={project.project_registration || ''} />
          </div>
        </Section>

        {/* Dates */}
        <Section title="Important Dates">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <Field label="Estimated Order Date" value={formatDate(project.estimated_order_date)} />
            <Field label="Estimated Delivery Date" value={formatDate(project.estimated_delivery_date)} />
            <Field label="Estimated Arrival Date" value={formatDate(project.estimated_arrival_date)} />
          </div>
        </Section>

        {/* Financial Information */}
        <Section title="Financial Information">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <Field label="Project Value" value={formatCurrency(project.project_value)} />
            <Field label="Total Value Shipped" value={formatCurrency(project.total_value_shipped)} />
          </div>
        </Section>

        {/* Notes */}
        {project.note && (
          <Section title="Notes">
            <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap', color: '#555' }}>{project.note}</p>
          </Section>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/projects/${project.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Offers ({offers.length})</h2>
          <button
            onClick={() => navigate(`/offers/new?projectId=${id}&clientId=${project.client_id}`)}
            style={{ padding: '0.4rem 0.8rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            + New Offer
          </button>
        </div>
        {offers.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {offers.map((offer: any) => (
              <div
                key={offer.id}
                style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onClick={() => navigate(`/offers/${offer.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>
                      {offer.company?.name || 'Supplier'} - {new Date(offer.offer_date).toLocaleDateString('it-IT')}
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                      Status: {offer.status || 'draft'} | Items: {offer.items?.length || 0}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 'bold', color: '#007aff' }}>
                      {offer.total_amount != null ? `${offer.currency || '\u20AC'} ${Number(offer.total_amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '-'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#007bff', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this project.</p>
        )}
      </div>
    </div>
  );
};

export default ProjectDetail;
