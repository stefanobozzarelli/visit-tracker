import React, { useState } from 'react';
import axios from 'axios';
import '../styles/SearchBar.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface SearchBarProps {
  type: 'visits' | 'todos';
  onResults: (results: any[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ type, onResults, onLoading, onError }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      onError('Inserisci una query di ricerca');
      return;
    }

    try {
      setSearching(true);
      onLoading(true);
      onError('');

      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/search/${type}`,
        { query },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        onResults(response.data.data);
      } else {
        onError(response.data.error || 'Errore nella ricerca');
      }
    } catch (err) {
      onError('Errore nella ricerca: ' + (err as Error).message);
      console.error(err);
    } finally {
      setSearching(false);
      onLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    onResults([]);
    onError('');
  };

  return (
    <div className="search-bar">
      <form onSubmit={handleSearch}>
        <div className="search-input-group">
          <input
            type="text"
            className="search-input"
            placeholder={`Cerca ${type === 'visits' ? 'visite' : 'TODO'} usando il linguaggio naturale... (es: "${type === 'visits' ? 'visite di marzo con problemi' : 'TODO non completati per cliente X'}")`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={searching}
          />
          <button
            type="submit"
            className="search-btn"
            disabled={searching || !query.trim()}
          >
            {searching ? '🔍 Ricerca...' : '🔍 Ricerca'}
          </button>
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={handleClear}
              disabled={searching}
            >
              ✕
            </button>
          )}
        </div>
      </form>
      <p className="search-hint">
        💡 Usa il linguaggio naturale! Prova: "visite di questo mese", "TODO urgenti", "problemi riscontrati", ecc.
      </p>
    </div>
  );
};

export default SearchBar;
