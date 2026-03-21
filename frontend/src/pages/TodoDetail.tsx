import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { TodoItem } from '../types';

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

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/todos/edit/${todo.id}`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default TodoDetail;
