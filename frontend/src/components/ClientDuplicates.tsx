import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

// ---- Similarity helpers ----
function normalize(s: string): string {
  return (s || '').toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|ltd|llc|inc|co\.|corp|group|grp|&|and|di|del|della|dei|degli|delle)\b/g, '')
    .replace(/[-_.]/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const m = na.length, n = nb.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.6) return 0;
  const dp = Array.from({ length: m + 1 }, (_: unknown, i: number) =>
    Array.from({ length: n + 1 }, (_2: unknown, j: number) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = na[i-1] === nb[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return Math.round((1 - dp[m][n] / Math.max(m, n)) * 100);
}

function jaccard(a: string, b: string): number {
  const sa = new Set(normalize(a).split(' ').filter(w => w.length > 0));
  const sb = new Set(normalize(b).split(' ').filter(w => w.length > 0));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return Math.round(inter / union * 100);
}

function overlap(a: string, b: string): number {
  const sa = new Set(normalize(a).split(' ').filter(w => w.length > 0));
  const sb = new Set(normalize(b).split(' ').filter(w => w.length > 0));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(w => sb.has(w)).length;
  return Math.round(inter / Math.min(sa.size, sb.size) * 100);
}

function bestScore(a: string, b: string): number {
  return Math.max(levenshtein(a, b), jaccard(a, b), overlap(a, b));
}

interface DupGroup { clients: any[]; score: number; }

interface Props { allClients: any[]; }

export const ClientDuplicates: React.FC<Props> = ({ allClients }) => {
  const navigate = useNavigate();
  const [threshold, setThreshold] = useState(70);
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [mergeState, setMergeState] = useState<Record<string, { keepId: string; status: 'idle' | 'loading' | 'done' | 'error'; msg?: string }>>({});

  const analyze = useCallback(() => {
    setAnalyzing(true);
    setTimeout(() => {
      const used = new Set<number>();
      const found: DupGroup[] = [];
      for (let i = 0; i < allClients.length; i++) {
        if (used.has(i)) continue;
        const group: number[] = [i];
        for (let j = i + 1; j < allClients.length; j++) {
          if (used.has(j)) continue;
          if (bestScore(allClients[i].name, allClients[j].name) >= threshold) {
            group.push(j);
            used.add(j);
          }
        }
        if (group.length > 1) {
          const score = Math.max(...group.slice(1).map(j => bestScore(allClients[i].name, allClients[j].name)));
          found.push({ clients: group.map(idx => allClients[idx]), score });
          used.add(i);
        }
      }
      setGroups(found.sort((a, b) => b.score - a.score));
      setAnalyzing(false);
    }, 0);
  }, [allClients, threshold]);

  const merge = async (groupKey: string, fromId: string, toId: string) => {
    setMergeState(s => ({ ...s, [groupKey]: { keepId: toId, status: 'loading' } }));
    try {
      const r = await apiService.mergeClients(fromId, toId) as any;
      if (r.success) {
        const moved = Object.entries(r.moved || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nessun record collegato';
        setMergeState(s => ({ ...s, [groupKey]: { keepId: toId, status: 'done', msg: `Spostati: ${moved}` } }));
        setGroups(gs => gs ? gs.filter(g => g.clients.some(c => c.id === toId && g.clients[0].id !== toId || g.clients[0].id === toId) && !(g.clients.some(c => c.id === fromId))) : null);
      } else {
        setMergeState(s => ({ ...s, [groupKey]: { keepId: toId, status: 'error', msg: r.error || 'Errore' } }));
      }
    } catch (e: any) {
      setMergeState(s => ({ ...s, [groupKey]: { keepId: toId, status: 'error', msg: e.message } }));
    }
  };

  const exact = groups?.filter(g => normalize(g.clients[0].name) === normalize(g.clients[1]?.name)) ?? [];
  const fuzzy = groups?.filter(g => normalize(g.clients[0].name) !== normalize(g.clients[1]?.name)) ?? [];

  return (
    <div style={{ padding: '1.5rem 0' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          <span>Soglia similarità:</span>
          <input type="range" min={40} max={95} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ width: 140 }} />
          <span style={{ fontWeight: 600, color: 'var(--color-primary)', minWidth: 36 }}>{threshold}%</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(↓ più risultati, ↑ meno falsi positivi)</span>
        </div>
        <button className="btn btn-primary" onClick={analyze} disabled={analyzing || allClients.length === 0}
          style={{ padding: '0.5rem 1.25rem' }}>
          {analyzing ? 'Analisi…' : `🔍 Analizza ${allClients.length} clienti`}
        </button>
      </div>

      {groups === null && <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem' }}>Clicca Analizza per cercare i duplicati.</div>}

      {groups !== null && groups.length === 0 && (
        <div style={{ color: '#2d6a2d', background: '#e8f5e9', padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.88rem' }}>
          ✅ Nessun duplicato trovato con soglia {threshold}%.
        </div>
      )}

      {groups !== null && groups.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[
              { n: allClients.length, label: 'Clienti totali' },
              { n: exact.length, label: 'Duplicati esatti', color: '#c0392b' },
              { n: fuzzy.length, label: `Simili >${threshold}%`, color: '#856404' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--color-white)', borderRadius: 10, padding: '0.6rem 1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color || 'var(--color-primary)' }}>{s.n}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {exact.length > 0 && <SectionHeader label={`🔴 Duplicati esatti (${exact.length})`} />}
          {exact.map(g => <DupGroupCard key={g.clients[0].id} g={g} mergeState={mergeState} onMerge={merge} onNavigate={id => navigate(`/clients/${id}`)} />)}

          {fuzzy.length > 0 && <SectionHeader label={`🟡 Nomi simili — verificare (${fuzzy.length})`} />}
          {fuzzy.map(g => <DupGroupCard key={g.clients[0].id} g={g} mergeState={mergeState} onMerge={merge} onNavigate={id => navigate(`/clients/${id}`)} />)}
        </>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)', margin: '1.25rem 0 0.5rem' }}>{label}</div>
);

interface CardProps {
  g: DupGroup;
  mergeState: Record<string, any>;
  onMerge: (key: string, fromId: string, toId: string) => void;
  onNavigate: (id: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Client', developer: 'Developer', 'architetto-designer': 'Arch/Design',
};

const DupGroupCard: React.FC<CardProps> = ({ g, mergeState, onMerge, onNavigate }) => {
  const key = g.clients.map(c => c.id).join('-');
  const ms = mergeState[key];
  const [keepId, setKeepId] = useState(g.clients[0].id);

  if (ms?.status === 'done') {
    return (
      <div style={{ background: '#e8f5e9', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#2d6a2d' }}>
        ✅ Unione completata. {ms.msg}
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '1rem 1.1rem', boxShadow: '0 3px 12px rgba(0,0,0,0.07)', marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        Similarità ~{g.score}%
      </div>
      {g.clients.map((c, i) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: i < g.clients.length - 1 ? '1px solid var(--color-bg)' : 'none' }}>
          <span
            style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={() => onNavigate(c.id)}
          >{c.name}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{c.country || ''}</span>
          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 20, background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
            {ROLE_LABELS[c.role] || c.role || 'Client'}
          </span>
          {i > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 20, background: '#FFF3CD', color: '#856404' }}>
              {bestScore(g.clients[0].name, c.name)}%
            </span>
          )}
        </div>
      ))}

      {/* Merge bar */}
      <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid var(--color-bg)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Tieni:</span>
        <select
          value={keepId}
          onChange={e => setKeepId(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '0.35rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: '0.82rem' }}
        >
          {g.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          disabled={ms?.status === 'loading'}
          onClick={() => {
            const removeIds = g.clients.filter(c => c.id !== keepId).map(c => c.id);
            if (!window.confirm(`Sposta tutti i dati di "${g.clients.filter(c => c.id !== keepId).map(c => c.name).join(', ')}" su "${g.clients.find(c => c.id === keepId)?.name}" ed elimina i duplicati?`)) return;
            (async () => {
              for (const rid of removeIds) await onMerge(key, rid, keepId);
            })();
          }}
          style={{ padding: '0.35rem 1rem', background: '#c0392b', color: 'white', border: 'none', borderRadius: 7, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {ms?.status === 'loading' ? '⏳' : '🔗 Unisci'}
        </button>
      </div>
      {ms?.status === 'error' && <div style={{ fontSize: '0.78rem', color: '#c0392b', marginTop: 4 }}>❌ {ms.msg}</div>}
    </div>
  );
};
