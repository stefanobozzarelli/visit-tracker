import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { TodoItem, TodoAttachment } from '../types';
import { config } from '../config';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';

const STATUS_CONFIG: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  done: 'Completed',
};

export const TodoDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadTodo = async () => {
      try {
        const res = await apiService.getTodoById(id);
        if (res.success && res.data) {
          setTodo(res.data);
        } else {
          setError('Task not found');
        }
      } catch (err) {
        setError('Error loading task');
      } finally {
        setLoading(false);
      }
    };
    loadTodo();
  }, [id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!todo) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate('/tasks')} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Task Details</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Title</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{todo.title || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Status</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{STATUS_CONFIG[todo.status] || todo.status}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Due Date</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{formatDate(todo.due_date)}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Assigned To</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{(todo as any).assigned_to_user?.name || '-'}</p>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Description</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{todo.description || '-'}</p>
        </div>

        {/* Attachments */}
        {todo.attachments && todo.attachments.length > 0 && (
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.75rem' }}>Attachments ({todo.attachments.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {todo.attachments.map((att: TodoAttachment) => {
                const baseUrl = config.API_BASE_URL;
                return (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{att.filename}</span>
                      <span style={{ fontSize: '0.8rem', color: '#999' }}>
                        {att.file_size < 1024 ? att.file_size + ' B' : att.file_size < 1024 * 1024 ? (att.file_size / 1024).toFixed(1) + ' KB' : (att.file_size / (1024 * 1024)).toFixed(1) + ' MB'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => window.open(`${baseUrl}/todos/${todo.id}/attachments/${att.id}/preview`, '_blank')}
                        style={{ padding: '0.3rem 0.6rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Open
                      </button>
                      <a
                        href={`${baseUrl}/todos/${todo.id}/attachments/${att.id}/download`}
                        download={att.filename}
                        style={{ padding: '0.3rem 0.6rem', background: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'none' }}
                      >
                        Download
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/todos/edit/${todo.id}`)}
            style={{ padding: '0.6rem 1.2rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default TodoDetail;
