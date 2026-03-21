import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company } from '../types';
import { encodeMetadata, VisitMetadata, decodeMetadata } from '../utils/visitMetadata';
import '../styles/CrudPages.css';

export const NewVisit: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isEditMode = !!editId;
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', country: '' });
  const [isAddingNewCountry, setIsAddingNewCountry] = useState(false);
  const [newCountryInput, setNewCountryInput] = useState('');

  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCompanyData, setNewCompanyData] = useState({ name: '', country: '', industry: '' });

  const [formData, setFormData] = useState({
    clientId: '',
    visitDate: '',
    status: 'scheduled',
    preparation: '',
    reports: [{ companyId: '', section: '', content: '' }],
  });

  const [metadata, setMetadata] = useState<VisitMetadata>({
    location: '',
    purpose: '',
    outcome: '',
    followUpRequired: false,
    nextAction: '',
  });

  const [pendingDirectFiles, setPendingDirectFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  // Inline tasks to create with the visit
  const [tasks, setTasks] = useState<{ title: string; companyId: string; dueDate: string; assignedToUserId: string; files: File[] }[]>([]);

  // Edit mode: track existing reports, orders, and deletions
  const [existingReports, setExistingReports] = useState<{ id: string; companyId: string; section: string; content: string; status: string }[]>([]);
  const [existingOrders, setExistingOrders] = useState<any[]>([]);
  const [deletedReportIds, setDeletedReportIds] = useState<Set<string>>(new Set());
  const [originalVisitData, setOriginalVisitData] = useState<any>(null);

  // Order management state
  const [newOrders, setNewOrders] = useState<{ supplier_id: string; supplier_name: string; order_date: string; payment_method: string; notes: string; status: 'draft' | 'confirmed' | 'completed' }[]>([]);
  const [deletedOrderIds, setDeletedOrderIds] = useState<Set<string>>(new Set());
  const [editingOrderIdx, setEditingOrderIdx] = useState<number | null>(null);

  // Report-level attachments: map from report index to files
  const [reportAttachments, setReportAttachments] = useState<{ [reportIdx: number]: File[] }>({});

  useEffect(() => {
    loadData();
    if (isEditMode && editId) {
      loadVisitForEdit(editId);
    }
  }, [editId, isEditMode]);

  // Derive unique countries from existing clients + newly added countries in form
  const countries = useMemo(() => {
    const uniqueCountries = new Set(clients.map(c => c.country).filter(Boolean));
    // Also include newClientData.country if it's set but not in the list (for new countries being added)
    if (newClientData.country && !uniqueCountries.has(newClientData.country)) {
      uniqueCountries.add(newClientData.country);
    }
    return Array.from(uniqueCountries).sort();
  }, [clients, newClientData.country]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Load clients and companies independently - one failure should NOT affect the other
      try {
        const clientsRes = await apiService.getClients();
        if (clientsRes.success && clientsRes.data) {
          const sortedClients = clientsRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setClients(sortedClients);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load clients:', err);
      }

      try {
        const companiesRes = await apiService.getCompanies();
        if (companiesRes.success && companiesRes.data) {
          const sortedCompanies = companiesRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setCompanies(sortedCompanies);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load companies:', err);
      }

      try {
        const usersRes = await apiService.getUsers();
        if (usersRes.success && usersRes.data) {
          const sortedUsers = usersRes.data.sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '')
          );
          setUsers(sortedUsers);
        }
      } catch (err) {
        console.warn('[NewVisit] Failed to load users:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadVisitForEdit = async (visitId: string) => {
    try {
      const res = await apiService.getVisit(visitId);
      if (res.success && res.data) {
        const visit = res.data;
        const metadata = decodeMetadata(visit.reports || []);

        // Separate existing reports from new ones
        const existingReportsList = (visit.reports || [])
          .filter((r: any) => !r.section.startsWith('__metadata'))
          .map((r: any) => ({
            id: r.id,
            companyId: r.company_id,
            section: r.section,
            content: r.content,
            status: r.status,
          }));

        setExistingReports(existingReportsList);
        setOriginalVisitData({
          clientId: visit.client_id,
          visitDate: visit.visit_date,
          status: visit.status,
          preparation: visit.preparation,
        });

        setFormData({
          clientId: visit.client_id,
          visitDate: visit.visit_date ? visit.visit_date.split('T')[0] : '',
          status: visit.status || 'scheduled',
          preparation: visit.preparation || '',
          reports: existingReportsList.map(r => ({
            companyId: r.companyId,
            section: r.section,
            content: r.content,
          })),
        });

        setMetadata({
          location: metadata?.location || '',
          purpose: metadata?.purpose || '',
          outcome: metadata?.outcome || '',
          followUpRequired: metadata?.followUpRequired || false,
          nextAction: metadata?.nextAction || '',
        });

        // Load customer orders
        try {
          const ordersRes = await apiService.getOrdersByVisit(visitId);
          if (ordersRes.success && ordersRes.data) {
            setExistingOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
          }
        } catch (orderErr) {
          console.warn('[NewVisit] Failed to load orders:', orderErr);
        }
      }
    } catch (err) {
      setError('Error loading visit');
      console.warn('[NewVisit] Failed to load visit:', err);
    }
  };

  const handleAddReport = () => {
    setFormData({
      ...formData,
      reports: [...formData.reports, { companyId: '', section: '', content: '' }],
    });
  };

  const handleRemoveReport = (index: number) => {
    const reportToRemove = formData.reports[index];
    const existingReport = existingReports[index];

    // If this is an existing report, mark it for deletion
    if (existingReport?.id) {
      setDeletedReportIds(prev => new Set([...prev, existingReport.id]));
    }

    // Remove from form display
    setFormData({
      ...formData,
      reports: formData.reports.filter((_, i) => i !== index),
    });
    setExistingReports(prev => prev.filter((_, i) => i !== index));
  };

  const handleReportChange = (index: number, field: string, value: string) => {
    const newReports = [...formData.reports];
    newReports[index] = { ...newReports[index], [field]: value };
    setFormData({ ...formData, reports: newReports });

    // Also update existingReports if editing an existing report
    if (existingReports[index]?.id) {
      const updatedExisting = [...existingReports];
      updatedExisting[index] = { ...updatedExisting[index], [field]: value };
      setExistingReports(updatedExisting);
    }
  };

  // Order management functions
  const handleAddOrder = () => {
    const newOrderIdx = newOrders.length;
    setNewOrders([
      ...newOrders,
      {
        supplier_id: '',
        supplier_name: '',
        order_date: new Date().toISOString().split('T')[0],
        payment_method: 'transfer',
        notes: '',
        status: 'draft' as const,
      },
    ]);
    setEditingOrderIdx(newOrderIdx);
  };

  const handleRemoveNewOrder = (index: number) => {
    setNewOrders(prev => prev.filter((_, i) => i !== index));
    if (editingOrderIdx === index) {
      setEditingOrderIdx(null);
    }
  };

  const handleRemoveExistingOrder = (orderId: string) => {
    setDeletedOrderIds(prev => new Set([...prev, orderId]));
    setExistingOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const handleOrderChange = (isNew: boolean, index: number, field: string, value: string) => {
    if (isNew) {
      const updatedOrders = [...newOrders];
      updatedOrders[index] = { ...updatedOrders[index], [field]: value };
      setNewOrders(updatedOrders);
    }
  };

  // Report attachment functions
  const handleReportAttachmentSelect = (reportIdx: number, files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setReportAttachments(prev => ({
      ...prev,
      [reportIdx]: [...(prev[reportIdx] || []), ...newFiles],
    }));
  };

  const handleRemoveReportAttachment = (reportIdx: number, fileIdx: number) => {
    setReportAttachments(prev => ({
      ...prev,
      [reportIdx]: (prev[reportIdx] || []).filter((_, i) => i !== fileIdx),
    }));
  };

  const handleCreateClient = async () => {
    if (!newClientData.name || !newClientData.country) {
      setError('Fill in client name and country');
      return;
    }

    try {
      const response = await apiService.createClient(newClientData.name, newClientData.country);
      if (response.success) {
        const updatedClients = [...clients, response.data].sort((a, b) => a.name.localeCompare(b.name));
        setClients(updatedClients);
        setFormData({ ...formData, clientId: response.data.id });
        setShowNewClientForm(false);
        setNewClientData({ name: '', country: '' });
        setSuccess('Client created successfully');
      }
    } catch (err) {
      setError('Error creating client');
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyData.name || !newCompanyData.country) {
      setError('Fill in company name and country');
      return;
    }

    try {
      const response = await apiService.createCompany(newCompanyData.name, newCompanyData.country, newCompanyData.industry);
      if (response.success) {
        const updatedCompanies = [...companies, response.data].sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(updatedCompanies);
        // Auto-select in first report
        if (formData.reports.length > 0) {
          const newReports = [...formData.reports];
          newReports[0].companyId = response.data.id;
          setFormData({ ...formData, reports: newReports });
        }
        setShowNewCompanyForm(false);
        setNewCompanyData({ name: '', country: '', industry: '' });
        setSuccess('Company created successfully');
      }
    } catch (err) {
      setError('Error creating company');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDirectFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setPendingDirectFiles(prev => [...prev, ...newFiles]);
    if (directFileInputRef.current) directFileInputRef.current.value = '';
  };

  const handleRemovePendingDirectFile = (index: number) => {
    setPendingDirectFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const errors: string[] = [];

    try {
      let visitId = editId;

      if (isEditMode && editId) {
        // UPDATE EXISTING VISIT MODE

        // 1. Update core visit fields (status, preparation)
        try {
          const updateRes = await apiService.updateVisit(editId, {
            status: formData.status,
            preparation: formData.preparation || undefined,
          });
          if (!updateRes.success) {
            errors.push('Failed to update visit information');
          }
        } catch (err) {
          console.error('Failed to update visit:', err);
          errors.push('Error updating visit information');
        }

        // 2. Update metadata if changed
        const metaReport = encodeMetadata(metadata);
        if (metaReport && formData.reports[0]?.companyId) {
          try {
            // Find and update metadata report, or create if doesn't exist
            await apiService.addVisitReport(editId, formData.reports[0].companyId, metaReport.section, metaReport.content);
          } catch (err) {
            console.error('Failed to update metadata:', err);
          }
        }

        // 3. Update existing reports
        for (const report of existingReports) {
          if (deletedReportIds.has(report.id)) {
            // Delete report
            try {
              await apiService.deleteVisitReport(editId, report.id);
            } catch (err) {
              console.error('Failed to delete report:', err);
              errors.push(`Failed to delete report for ${report.companyId}`);
            }
          } else {
            // Update report if changed
            try {
              await apiService.updateVisitReport(editId, report.id, {
                company_id: report.companyId,
                section: report.section,
                content: report.content,
              });
            } catch (err) {
              console.error('Failed to update report:', err);
              errors.push(`Failed to update report for ${report.companyId}`);
            }
          }
        }

        // 4. Create new reports (ones without ID) and track their IDs for file uploads
        const newReportIds: { [formIdx: number]: string } = {};
        const newReportsToCreate = formData.reports.filter((r, idx) => !existingReports[idx]?.id && r.companyId && r.section);
        for (let idx = 0; idx < formData.reports.length; idx++) {
          if (!existingReports[idx]?.id && formData.reports[idx].companyId && formData.reports[idx].section) {
            const report = formData.reports[idx];
            try {
              const res = await apiService.addVisitReport(editId, report.companyId, report.section, report.content);
              if (res.success && res.data?.id) {
                newReportIds[idx] = res.data.id;
              }
            } catch (err) {
              console.error('Failed to create report:', err);
              errors.push('Failed to create new report');
            }
          }
        }

        // 5. Delete orders marked for deletion
        for (const orderId of deletedOrderIds) {
          try {
            await apiService.deleteOrder(orderId);
          } catch (err) {
            console.error('Failed to delete order:', err);
            errors.push('Failed to delete one or more orders');
          }
        }
        setDeletedOrderIds(new Set());

        // 6. Create new orders
        const selectedClient = clients.find(c => c.id === formData.clientId);
        for (const order of newOrders) {
          if (order.supplier_id) {
            try {
              await apiService.createOrder({
                visit_id: editId,
                supplier_id: order.supplier_id,
                supplier_name: order.supplier_name,
                client_id: formData.clientId,
                client_name: selectedClient?.name || '',
                order_date: order.order_date,
                payment_method: order.payment_method,
                notes: order.notes,
              });
            } catch (err) {
              console.error('Failed to create order:', err);
              errors.push('Failed to create one or more orders');
            }
          }
        }
        setNewOrders([]);

        // 7. Upload report attachments for all reports (both existing and newly created)
        const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
        for (let idx = 0; idx < formData.reports.length; idx++) {
          const reportId = newReportIds[idx] || existingReports[idx]?.id;
          const files = reportAttachments[idx] || [];

          if (reportId && files.length > 0) {
            for (const file of files) {
              try {
                const formDataObj = new FormData();
                formDataObj.append('file', file);
                const uploadUrl = `${baseUrl}/visits/${editId}/reports/${reportId}/upload`;
                const uploadResponse = await fetch(uploadUrl, {
                  method: 'POST',
                  body: formDataObj,
                  headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                  },
                });

                if (!uploadResponse.ok) {
                  const errorData = await uploadResponse.json();
                  errors.push(`Failed to upload file: ${file.name}`);
                }
              } catch (err) {
                console.error('Failed to upload report attachment:', err);
                errors.push(`Failed to upload file: ${file.name}`);
              }
            }
          }
        }
        setReportAttachments({});
      } else {
        // CREATE NEW VISIT MODE

        const reports = formData.reports.map((r) => ({
          company_id: r.companyId,
          section: r.section,
          content: r.content,
        }));

        // Add metadata as hidden report if any fields are filled
        const metaReport = encodeMetadata(metadata);
        if (metaReport && formData.reports[0]?.companyId) {
          reports.push({
            company_id: formData.reports[0].companyId,
            section: metaReport.section,
            content: metaReport.content,
          });
        }

        const response = await apiService.createVisit(formData.clientId, formData.visitDate, reports, {
          status: formData.status,
          preparation: formData.preparation || undefined,
        });
        if (!response.success) {
          throw new Error('Error creating visit');
        }
        visitId = response.data?.id;
      }

      // Upload pending direct files (works for both create and edit)
      if (pendingDirectFiles.length > 0 && visitId) {
        for (const file of pendingDirectFiles) {
          try {
            await apiService.uploadVisitDirectAttachment(visitId, file);
          } catch {
            console.error('Failed to upload direct attachment:', file.name);
            errors.push(`Failed to upload file: ${file.name}`);
          }
        }
      }

      // Create inline tasks if any (only for new visits)
      if (!isEditMode) {
        for (const task of tasks) {
          if (task.title.trim()) {
            try {
              const todoRes = await apiService.createTodo(
                task.title,
                formData.clientId,
                task.companyId || formData.reports[0]?.companyId || '',
                task.assignedToUserId || user?.id || '',
                task.dueDate || undefined,
              );
              // Upload task attachments if any
              if (todoRes.success && todoRes.data?.id && task.files?.length > 0) {
                for (const file of task.files) {
                  try {
                    await apiService.uploadTodoAttachment(todoRes.data.id, file);
                  } catch { /* non-blocking */ }
                }
              }
            } catch { /* non-blocking */ }
          }
        }
      }

      // Show errors if any, but still navigate if visitId exists
      if (errors.length > 0) {
        setError(errors.join('; '));
      }

      if (visitId) {
        navigate(`/visits/${visitId}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>{isEditMode ? 'Edit Meeting' : 'Register Visit'}</h1>
        <button onClick={() => navigate('/visits')} className="btn-secondary">
          ← Back to Client Meetings
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Client *</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                disabled={isEditMode}
                required
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.country})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClientForm(!showNewClientForm)}
                disabled={isEditMode}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                + New Client
              </button>
            </div>

            {showNewClientForm && (
              <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '10px' }}>
                <div className="form-group">
                  <label>Client Name</label>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newClientData.name}
                    onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Country</label>
                  {isAddingNewCountry ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="New country name..."
                        value={newCountryInput}
                        onChange={(e) => setNewCountryInput(e.target.value)}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCountryInput.trim()) {
                            setNewClientData({ ...newClientData, country: newCountryInput.trim() });
                            setIsAddingNewCountry(false);
                            setNewCountryInput('');
                          }
                        }}
                        style={{ padding: '8px 16px', backgroundColor: '#4a6078', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingNewCountry(false); setNewCountryInput(''); }}
                        style={{ padding: '8px 12px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={newClientData.country}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewCountry(true);
                        } else {
                          setNewClientData({ ...newClientData, country: e.target.value });
                        }
                      }}
                    >
                      <option value="">Select country...</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__add_new__">+ Add new country...</option>
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={handleCreateClient} className="btn-primary" style={{ flex: 1 }}>
                    Create Client
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewClientForm(false);
                      setNewClientData({ name: '', country: '' });
                    }}
                    className="btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label>Visit Date *</label>
              <input
                type="date"
                value={formData.visitDate}
                onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
                disabled={isEditMode}
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Preparation / Pre-meeting Notes</label>
            <textarea
              value={formData.preparation}
              onChange={(e) => setFormData(prev => ({ ...prev, preparation: e.target.value }))}
              rows={5}
              placeholder="Notes, agenda items, topics to discuss..."
            />
          </div>

          {/* Visit Metadata */}
          <div style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: '#fafbfc' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Visit Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Location</label>
                <input
                  type="text"
                  placeholder="e.g. Milan office, phone call..."
                  value={metadata.location}
                  onChange={e => setMetadata({ ...metadata, location: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Product presentation, follow-up..."
                  value={metadata.purpose}
                  onChange={e => setMetadata({ ...metadata, purpose: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Outcome</label>
              <input
                type="text"
                placeholder="e.g. Positive, order placed, need follow-up..."
                value={metadata.outcome}
                onChange={e => setMetadata({ ...metadata, outcome: e.target.value })}
              />
            </div>
            {/* Next Action and Follow-up removed — use Tasks page to create follow-ups */}
          </div>

          <h3>Report per Company</h3>

          {formData.reports.map((report, index) => (
            <div
              key={index}
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#fafafa',
              }}
            >
              <div className="form-group">
                <label>Represented Company *</label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <select
                    value={report.companyId}
                    onChange={(e) => handleReportChange(index, 'companyId', e.target.value)}
                    required
                    style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
                  >
                    <option value="">Select company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCompanyForm(!showNewCompanyForm)}
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + New Company
                  </button>
                </div>

                {showNewCompanyForm && (
                  <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '10px' }}>
                    <div className="form-group">
                      <label>Company Name</label>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newCompanyData.name}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Country</label>
                      <input
                        type="text"
                        placeholder="Country"
                        value={newCompanyData.country}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, country: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Industry (optional)</label>
                      <input
                        type="text"
                        placeholder="E.g: Technology, Finance, etc."
                        value={newCompanyData.industry}
                        onChange={(e) => setNewCompanyData({ ...newCompanyData, industry: e.target.value })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="button" onClick={handleCreateCompany} className="btn-primary" style={{ flex: 1 }}>
                        Create Company
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewCompanyForm(false);
                          setNewCompanyData({ name: '', country: '', industry: '' });
                        }}
                        className="btn-secondary"
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons for this report */}
              {report.companyId && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const clientId = formData.clientId;
                      if (!clientId) {
                        setError('Please select a client first');
                        return;
                      }
                      const params = new URLSearchParams({
                        clientId: clientId,
                        companyId: report.companyId,
                      });
                      // Use real report ID if available (edit mode), otherwise just pass visitId
                      const reportId = existingReports[index]?.id;
                      if (reportId) {
                        params.set('visitReportId', reportId);
                      }
                      if (editId) {
                        params.set('visitId', editId);
                      }
                      navigate(`/todos/new?${params.toString()}`);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'var(--color-info)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Task
                  </button>
                  <button
                    type="button"
                    disabled={!isEditMode}
                    title={!isEditMode ? 'Save visit first to add orders' : undefined}
                    onClick={() => {
                      if (!isEditMode) return;
                      handleAddOrder();
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: isEditMode ? 'var(--color-warning)' : 'var(--color-border)',
                      color: isEditMode ? '#333' : 'var(--color-text-tertiary)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isEditMode ? 'pointer' : 'not-allowed',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Order
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>Report Section *</label>
                <input
                  type="text"
                  placeholder="E.g: Analysis, Proposals, Follow-up, etc."
                  value={report.section}
                  onChange={(e) => handleReportChange(index, 'section', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Report Content *</label>
                <textarea
                  placeholder="Describe the result of the visit for this company..."
                  value={report.content}
                  onChange={(e) => handleReportChange(index, 'content', e.target.value)}
                  rows={5}
                  required
                />
              </div>

              {/* Report-level attachments */}
              <div className="cv-attachments-section" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600' }}>Attachments for this section</label>
                <div
                  className="cv-attachment-dropzone"
                  style={{
                    border: '2px dashed var(--color-border)',
                    borderRadius: '4px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    marginBottom: '0.5rem',
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleReportAttachmentSelect(index, e.dataTransfer.files);
                  }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const fileInput = e.target as HTMLInputElement;
                      handleReportAttachmentSelect(index, fileInput.files);
                    };
                    input.click();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Drag files here or click to upload
                </div>
                {(reportAttachments[index] || []).length > 0 && (
                  <div className="cv-attachment-list">
                    {(reportAttachments[index] || []).map((file, fIdx) => (
                      <div key={fIdx} className="cv-attachment-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                          <span style={{ fontSize: '0.875rem' }}>{file.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{formatFileSize(file.size)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveReportAttachment(index, fIdx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: '1rem' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formData.reports.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveReport(index)}
                  className="btn-danger"
                >
                  Remove Section
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddReport}
            className="btn-secondary"
            style={{ marginBottom: '1rem' }}
          >
            + Add Another Company
          </button>

          {/* Tasks section - only for new visits */}
          {!isEditMode && (
            <>
              <h3 style={{ marginTop: '1.5rem' }}>Tasks</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-tertiary)', marginBottom: '0.75rem' }}>
                Add follow-up tasks for this visit. They will be created when you register the visit.
              </p>
            </>
          )}
          {!isEditMode && tasks.map((task, idx) => (
            <div key={idx} style={{ padding: '0.75rem', marginBottom: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Task *</label>
                  <input
                    type="text"
                    placeholder="e.g. Send quotation..."
                    value={task.title}
                    onChange={e => { const t = [...tasks]; t[idx].title = e.target.value; setTasks(t); }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Company</label>
                  <select
                    value={task.companyId}
                    onChange={e => { const t = [...tasks]; t[idx].companyId = e.target.value; setTasks(t); }}
                  >
                    <option value="">Select company...</option>
                    {formData.reports.filter(r => r.companyId).map((r, i) => {
                      const co = companies.find(c => c.id === r.companyId);
                      return co ? <option key={i} value={co.id}>{co.name}</option> : null;
                    })}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Assigned To</label>
                  <select
                    value={task.assignedToUserId}
                    onChange={e => { const t = [...tasks]; t[idx].assignedToUserId = e.target.value; setTasks(t); }}
                  >
                    <option value="">Select user...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={task.dueDate}
                    onChange={e => { const t = [...tasks]; t[idx].dueDate = e.target.value; setTasks(t); }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTasks(tasks.filter((_, i) => i !== idx))}
                  style={{ padding: '0.5rem', background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: '1.125rem' }}
                >
                  ×
                </button>
              </div>
              {/* Attachments for this task */}
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-info)', padding: '4px 8px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                  Allega file
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files) {
                        const t = [...tasks];
                        t[idx].files = [...(t[idx].files || []), ...Array.from(e.target.files!)];
                        setTasks(t);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {(task.files || []).map((file, fIdx) => (
                  <span key={fIdx} style={{ fontSize: '0.75rem', background: 'var(--color-bg-secondary, #f5f3ee)', padding: '2px 8px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {file.name}
                    <button
                      type="button"
                      onClick={() => { const t = [...tasks]; t[idx].files = t[idx].files.filter((_, i) => i !== fIdx); setTasks(t); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: '0.75rem', padding: '0 2px' }}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!isEditMode && (
            <button
              type="button"
              onClick={() => setTasks([...tasks, { title: '', companyId: formData.reports[0]?.companyId || '', dueDate: '', assignedToUserId: '', files: [] }])}
              className="btn-secondary"
              style={{ marginBottom: '1rem' }}
            >
              + Add Task
            </button>
          )}

          {/* Direct File Attachments */}
          <div className="cv-attachments-section" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
            <label>Attachments</label>

            <div
              className={`cv-attachment-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleDirectFileSelect(e.dataTransfer.files); }}
              onClick={() => directFileInputRef.current?.click()}
            >
              <input
                ref={directFileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleDirectFileSelect(e.target.files)}
              />
              <span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Drag files here or click to upload
              </span>
            </div>

            {pendingDirectFiles.length > 0 && (
              <div className="cv-attachment-list">
                {pendingDirectFiles.map((file, idx) => (
                  <div key={idx} className="cv-attachment-item">
                    <div className="attachment-info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">{formatFileSize(file.size)}</span>
                      <span className="attachment-pending-badge">Pending upload</span>
                    </div>
                    <button
                      type="button"
                      className="attachment-delete"
                      onClick={() => handleRemovePendingDirectFile(idx)}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Orders Section - Edit Mode Only */}
          {isEditMode && (existingOrders.length > 0 || newOrders.length > 0) && (
            <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, marginTop: 0 }}>Customer Orders</h3>
                <button
                  type="button"
                  onClick={handleAddOrder}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  + Add Order
                </button>
              </div>

              {/* Existing Orders */}
              {existingOrders.length > 0 && (
                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
                  {existingOrders.map((order) => (
                    <div key={order.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', cursor: 'pointer' }} onClick={() => navigate(`/orders/${order.id}/edit`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.2rem', fontWeight: '700' }}>{order.supplier_name || 'Supplier'}</h4>
                          <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: '#666' }}>
                            Order #{order.id.substring(0, 8)} | Date: {new Date(order.order_date).toLocaleDateString('it-IT')} | Payment: {order.payment_method}
                          </p>
                          {order.notes && <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#999' }}>Notes: {order.notes}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}/edit`); }}
                            style={{ background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveExistingOrder(order.id); }}
                            style={{ background: 'var(--color-error)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#666', display: 'block', marginBottom: '0.5rem' }}>Lines</label>
                          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem' }}>{order.items?.length || 0}</p>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#666', display: 'block', marginBottom: '0.5rem' }}>Total Amount</label>
                          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem', color: 'var(--color-info)' }}>€ {typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : parseFloat(String(order.total_amount)).toFixed(2)}</p>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#666', display: 'block', marginBottom: '0.5rem' }}>Status</label>
                          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem' }}>{order.status || 'draft'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* New Orders Being Created */}
              {newOrders.length > 0 && (
                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
                  {newOrders.map((order, idx) => (
                    <div key={`new-${idx}`} style={{ background: '#f9f9f9', border: '1px dashed #ddd', borderRadius: '8px', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#999' }}>New Order (unsaved)</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewOrder(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: '1.125rem' }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Supplier *</label>
                          <select
                            value={order.supplier_id}
                            onChange={(e) => {
                              const selectedCompany = companies.find(c => c.id === e.target.value);
                              handleOrderChange(true, idx, 'supplier_id', e.target.value);
                              const updatedOrders = [...newOrders];
                              updatedOrders[idx].supplier_name = selectedCompany?.name || '';
                              setNewOrders(updatedOrders);
                            }}
                            required
                          >
                            <option value="">Select supplier</option>
                            {companies.map((co) => (
                              <option key={co.id} value={co.id}>{co.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Order Date *</label>
                          <input
                            type="date"
                            value={order.order_date}
                            onChange={(e) => handleOrderChange(true, idx, 'order_date', e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Payment Method</label>
                          <select
                            value={order.payment_method}
                            onChange={(e) => handleOrderChange(true, idx, 'payment_method', e.target.value)}
                          >
                            <option value="transfer">Bank Transfer</option>
                            <option value="cash">Cash</option>
                            <option value="check">Check</option>
                            <option value="card">Card</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Status</label>
                          <select
                            value={order.status}
                            onChange={(e) => handleOrderChange(true, idx, 'status', e.target.value)}
                          >
                            <option value="draft">Draft</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                          <label>Notes</label>
                          <textarea
                            value={order.notes}
                            onChange={(e) => handleOrderChange(true, idx, 'notes', e.target.value)}
                            rows={2}
                            placeholder="Additional notes..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isEditMode ? (isSubmitting ? 'Saving...' : 'Save Changes') : (isSubmitting ? 'Registering...' : 'Register Visit')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/visits')}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
