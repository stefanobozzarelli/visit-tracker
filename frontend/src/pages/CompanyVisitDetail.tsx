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
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadVisit = async () => {
      try {
        const res = await apiService.getCompanyVisitById(id);
        if (res.success && res.data) {
          setVisit(res.data);
          try {
            const offersRes = await apiService.getOffers({ company_visit_id: id });
            if (offersRes.success && offersRes.data) {
              setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
            }
          } catch {}
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

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Offers ({offers.length})</h2>
          <button
            onClick={() => navigate(`/offers/new?companyVisitId=${id}&companyId=${visit.company_id}`)}
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
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this meeting.</p>
        )}
      </div>
    </div>
  );
};

export default CompanyVisitDetail;
