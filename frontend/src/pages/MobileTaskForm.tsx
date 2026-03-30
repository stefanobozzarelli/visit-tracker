import React, { useState } from 'react';
import { Client, Company, User } from '../types';
import '../styles/MobileTasks.css';

interface MobileTaskFormProps {
  clients: Client[];
  companies: Company[];
  users: User[];
  currentUserId: string;
  isStefano: boolean;
  onSave: (data: {
    title: string;
    category: string;
    priority: number;
    dueDate: string;
    clientId: string;
    companyId: string;
    assignedToUserId: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const MobileTaskForm: React.FC<MobileTaskFormProps> = ({
  clients,
  companies,
  users,
  currentUserId,
  isStefano,
  onSave,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('work');
  const [priority, setPriority] = useState(1);
  const [dueDate, setDueDate] = useState('');
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUserId);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        priority,
        dueDate,
        clientId,
        companyId,
        assignedToUserId: assignedTo,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-form-overlay" onClick={onClose}>
      <div className="mt-form-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mt-form-header">
          <span className="mt-form-title">New Task</span>
          <button className="mt-form-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="mt-form-group">
            <label className="mt-form-label">Title *</label>
            <input
              className="mt-form-input"
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Category */}
          <div className="mt-form-group">
            <label className="mt-form-label">Category</label>
            <select
              className="mt-form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              {isStefano && <option value="architectural_lines">Arch Lines</option>}
            </select>
          </div>

          {/* Priority */}
          <div className="mt-form-group">
            <label className="mt-form-label">Priority</label>
            <div className="mt-star-picker">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`mt-star-pick${n <= priority ? ' filled' : ''}`}
                  onClick={() => setPriority(n)}
                >
                  {n <= priority ? '\u2605' : '\u2606'}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div className="mt-form-group">
            <label className="mt-form-label">Due Date</label>
            <input
              className="mt-form-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Client */}
          <div className="mt-form-group">
            <label className="mt-form-label">Client</label>
            <select
              className="mt-form-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">None</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Company */}
          <div className="mt-form-group">
            <label className="mt-form-label">Company</label>
            <select
              className="mt-form-select"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned to */}
          <div className="mt-form-group">
            <label className="mt-form-label">Assigned To</label>
            <select
              className="mt-form-select"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="mt-form-submit"
            disabled={saving || !title.trim()}
          >
            {saving ? 'Saving...' : 'Save Task'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MobileTaskForm;
