import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company, CompanyVisit, Visit, TodoItem, Claim, Opportunity } from '../types';
import { METADATA_SECTION } from '../utils/visitMetadata';
import { fmtEur, fmtNum } from '../utils/numberFormat';
import '../styles/ClientDetail.css';
import '../styles/CompanyDetail.css';

const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT') : '-');
const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const MEETING_STATUS: Record<string, string> = { scheduled: 'Programmato', completed: 'Completato', cancelled: 'Annullato' };
const CLAIM_STATUS: Record<string, string> = { open: 'Aperto', in_progress: 'In corso', resolved: 'Risolto', closed: 'Chiuso' };
const OPP_STATUS: Record<string, string> = {
  open: 'Aperta', in_progress: 'In corso', qualified: 'Qualificata', negotiation: 'Trattativa',
  closed_won: 'Vinta', closed_lost: 'Persa',
};

const isOpenTodo = (t: TodoItem) => t.status !== 'done' && (t.status as string) !== 'completed';
const listOf = (r: any) => (r?.success && Array.isArray(r.data) ? r.data : []);
const uniqById = <T extends { id: string }>(items: T[]) => [...new Map(items.map(i => [i.id, i])).values()];

export const CompanyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canViewRevenue = user?.role === 'master_admin' || (user?.role === 'admin' && !!(user as any)?.can_view_revenue);

  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [meetings, setMeetings] = useState<CompanyVisit[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [commAll, setCommAll] = useState<any>(null);
  const [commYear, setCommYear] = useState<any>(null);
  const [showAllClients, setShowAllClients] = useState(false);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setShowAllClients(false);
    try {
      let comp: Company | null = null;
      let all: Company[] = [];
      try { const r = await apiService.getCompany(id); if (r.success && r.data) comp = r.data; } catch {}
      try { const r = await apiService.getCompanies(); all = listOf(r); } catch {}
      setCompany(comp);
      setCompanies(all);
      if (!comp) return;

      // A statistics group ("Gruppo ABK") shows the data of all its member companies together
      const ids = [...new Set([id, ...(comp.group_members || [])])];
      const each = <T,>(fn: (cid: string) => Promise<any>) =>
        Promise.all(ids.map(cid => fn(cid).then(listOf).catch(() => []))).then(r => r.flat() as T[]);

      const tasks: Promise<any>[] = [
        apiService.getCompanyVisits({ companyIds: ids }).then(r => setMeetings(listOf(r))).catch(() => {}),
        apiService.getVisits().then(r => setVisits(listOf(r))).catch(() => {}),
        apiService.getClients().then(r => setClients(listOf(r))).catch(() => {}),
        each<TodoItem>(cid => apiService.getTodos({ companyId: cid })).then(r => setTodos(uniqById(r))),
        each<Claim>(cid => apiService.getClaims({ company_id: cid })).then(r => setClaims(uniqById(r))),
        each<Opportunity>(cid => apiService.getOpportunities({ company_id: cid })).then(r => setOpportunities(uniqById(r))),
      ];
      if (canViewRevenue) {
        // The backend expands a group id into the group + its members for these statistics
        tasks.push(
          apiService.getInvoiceStats({ company_id: id }).then(r => setStats(r?.success ? r.data : null)).catch(() => setStats(null)),
          apiService.getCommissionStats({ company_id: id }).then(r => setCommAll(r?.success ? r.data : null)).catch(() => setCommAll(null)),
          apiService.getCommissionStats({ company_id: id, start_date: `${year}-01-01`, end_date: `${year}-12-31` })
            .then(r => setCommYear(r?.success ? r.data : null)).catch(() => setCommYear(null)),
          each<any>(cid => apiService.getPriceLists(cid)).then(r => setPriceLists(uniqById(r).filter(p => ids.includes(p.company_id)))),
        );
      } else {
        setStats(null); setCommAll(null); setCommYear(null); setPriceLists([]);
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  };

  const byId = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const memberIds = useMemo(() => (company?.group_members || []).filter(m => m !== id), [company, id]);
  const isGroup = memberIds.length > 0;
  const groupIds = useMemo(() => new Set([id!, ...memberIds]), [id, memberIds]);
  const parentGroups = useMemo(
    () => companies.filter(c => c.id !== id && (c.group_members || []).includes(id!)),
    [companies, id],
  );
  const members = useMemo(
    () => memberIds.map(m => byId.get(m)).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name)) as Company[],
    [memberIds, byId],
  );
  const companyName = (cid?: string) => (cid && byId.get(cid)?.name) || '';

  // Client visits that have a report for this supplier (or a company of the group)
  const supplierVisits = useMemo(() => visits
    .map(v => ({ v, reps: (v.reports || []).filter(r => r.section !== METADATA_SECTION && r.company_id && groupIds.has(r.company_id)) }))
    .filter(x => x.reps.length > 0)
    .sort((a, b) => new Date(b.v.visit_date).getTime() - new Date(a.v.visit_date).getTime()),
  [visits, groupIds]);

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [meetings],
  );
  const lastMeeting = sortedMeetings.find(m => m.status !== 'cancelled' && new Date(m.date) <= new Date());
  const nextMeeting = [...sortedMeetings].reverse().find(m => m.status === 'scheduled' && new Date(m.date) > new Date());

  const openTodos = useMemo(() => todos.filter(isOpenTodo)
    .sort((a, b) => (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity)),
  [todos]);
  const openClaims = useMemo(() => claims.filter(c => c.status === 'open' || c.status === 'in_progress'), [claims]);
  const activeOpps = useMemo(() => opportunities.filter(o => o.status !== 'closed_won' && o.status !== 'closed_lost'), [opportunities]);
  const pipelineValue = activeOpps.reduce((s, o) => s + (Number(o.estimated_value) || 0), 0);

  // Clients followed for this supplier: assigned in the client record, plus those that bought from it
  const followedClients = useMemo(() => {
    const revenue = new Map<string, number>();
    for (const r of stats?.revenue_by_client || []) revenue.set(r.client_id, Number(r.total) || 0);
    const lastVisit = new Map<string, string>();
    for (const { v } of supplierVisits) if (!lastVisit.has(v.client_id)) lastVisit.set(v.client_id, v.visit_date);
    const rows = new Map<string, { id: string; name: string; country?: string; city?: string; revenue: number; lastVisit?: string }>();
    for (const c of clients) {
      const linked = (c.clientCompanies || []).some((cc: any) => groupIds.has(cc.company_id));
      if (linked || revenue.has(c.id)) {
        rows.set(c.id, { id: c.id, name: c.name, country: c.country, city: c.city, revenue: revenue.get(c.id) || 0, lastVisit: lastVisit.get(c.id) });
      }
    }
    for (const r of stats?.revenue_by_client || []) {
      if (!rows.has(r.client_id) && r.client_id) rows.set(r.client_id, { id: r.client_id, name: r.client_name || '-', revenue: Number(r.total) || 0 });
    }
    return [...rows.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }, [clients, groupIds, stats, supplierVisits]);

  // Revenue per month (last 12 months) and per year
  const months = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of stats?.revenue_by_month || []) totals.set(r.month, Number(r.total) || 0);
    const out: { key: string; label: string; total: number }[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: `${MONTHS[m.getMonth()]}${m.getMonth() === 0 ? ` ${String(m.getFullYear()).slice(2)}` : ''}`, total: totals.get(key) || 0 });
    }
    return out;
  }, [stats]);
  const maxMonth = Math.max(1, ...months.map(m => m.total));
  const yearTotal = (y: number) => (stats?.revenue_by_month || [])
    .filter((r: any) => String(r.month).startsWith(`${y}-`)).reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
  const thisYear = yearTotal(year);
  const lastYear = yearTotal(year - 1);
  // Year to date compared with the same months of last year
  const monthNow = new Date().getMonth() + 1;
  const lastYearSamePeriod = (stats?.revenue_by_month || [])
    .filter((r: any) => String(r.month).startsWith(`${year - 1}-`) && Number(String(r.month).slice(5, 7)) <= monthNow)
    .reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
  const trend = lastYearSamePeriod > 0 ? ((thisYear - lastYearSamePeriod) / lastYearSamePeriod) * 100 : null;

  if (loading) return <div className="cd-page"><div className="cd-loading">Caricamento...</div></div>;
  if (!company) return <div className="cd-page"><div className="cd-loading">Fornitore non trovato</div></div>;

  const back = `/companies/${id}`;
  const hasRevenue = canViewRevenue && stats && (stats.invoice_count > 0 || (commAll?.count || 0) > 0);
  const byCompany: any[] = (stats?.revenue_by_company || []).filter((r: any) => Number(r.total) > 0);
  const commByCompany = new Map<string, any>((commAll?.by_company || []).map((r: any) => [r.company_id, r]));

  return (
    <div className="cd-page">
      {/* Header */}
      <div className="cd-header">
        <div className="cd-header-left">
          <button className="cd-back" onClick={() => navigate('/companies')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Torna ai fornitori
          </button>
          <h1>{company.name}</h1>
          <div className="cd-header-meta">
            {(company.country || company.industry) && (
              <span className="cd-header-country">{[company.country, company.industry].filter(Boolean).join(' · ')}</span>
            )}
            <span className="cd-role-badge role-client">{isGroup ? 'Gruppo' : 'Fornitore'}</span>
            {company.rapporto && <span className="cd-role-badge role-architect">{company.rapporto}</span>}
            {parentGroups.map(g => (
              <button key={g.id} className="sd-chip" onClick={() => navigate(`/companies/${g.id}`)}>Fa parte di {g.name}</button>
            ))}
          </div>
        </div>
      </div>

      {isGroup && (
        <div className="cd-notes-card">
          <div className="cd-notes-label">Aziende del gruppo · i dati qui sotto sono la somma di tutte</div>
          <div className="sd-chips">
            {members.map(m => (
              <button key={m.id} className="sd-chip" onClick={() => navigate(`/companies/${m.id}`)}>{m.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Info cards row */}
      <div className={`cd-info-row${canViewRevenue ? ' sd-info-row' : ''}`}>
        {canViewRevenue && (
          <div className="cd-info-card">
            <div className="cd-info-label">Fatturato {year}</div>
            <div className="cd-info-value sd-big">{fmtEur(thisYear, { maximumFractionDigits: 0 })}</div>
            {trend !== null && (
              <div className={`sd-trend ${trend >= 0 ? 'up' : 'down'}`}>
                {trend >= 0 ? '▲' : '▼'} {fmtNum(Math.abs(trend), { maximumFractionDigits: 0 })}% sullo stesso periodo {year - 1}
              </div>
            )}
          </div>
        )}
        {canViewRevenue && (
          <div className="cd-info-card">
            <div className="cd-info-label">Provvigioni {year}</div>
            <div className="cd-info-value sd-big">{fmtEur(commYear?.total_gross || 0, { maximumFractionDigits: 0 })}</div>
            {(commYear?.total_net || 0) !== (commYear?.total_gross || 0) && (
              <div className="sd-trend">netto {fmtEur(commYear?.total_net || 0, { maximumFractionDigits: 0 })}</div>
            )}
          </div>
        )}
        <div className="cd-info-card">
          <div className="cd-info-label">Clienti seguiti</div>
          <div className="cd-info-value sd-big">{fmtNum(followedClients.length)}</div>
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Ultimo incontro</div>
          <div className="cd-info-value">{lastMeeting ? formatDate(lastMeeting.date) : 'Mai'}</div>
          {nextMeeting && <div className="sd-trend">prossimo {formatDate(nextMeeting.date)}</div>}
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Ultima visita cliente</div>
          <div className="cd-info-value">{supplierVisits[0] ? formatDate(supplierVisits[0].v.visit_date) : 'Mai'}</div>
        </div>
        <div className="cd-info-card">
          <div className="cd-info-label">Task aperti</div>
          <div className={`cd-info-value sd-big${openTodos.length > 0 ? ' alert' : ''}`}>{openTodos.length}</div>
        </div>
      </div>

      <div className="cd-right-col">
        {/* Revenue */}
        {canViewRevenue && (
          <div className="cd-card">
            <div className="cd-card-header">
              <h3>Fatturato e provvigioni</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="cd-link" onClick={() => navigate('/amministrazione/fatturato')}>Fatturato</button>
                <button className="cd-link" onClick={() => navigate('/amministrazione/provvigioni')}>Provvigioni</button>
              </div>
            </div>
            {!hasRevenue ? (
              <div className="cd-empty">Nessuna fattura caricata per questo fornitore</div>
            ) : (
              <>
                <div className="sd-kpis">
                  <div><span>Fatturato totale</span><strong>{fmtEur(stats.grand_total, { maximumFractionDigits: 0 })}</strong></div>
                  <div><span>Fatturato {year - 1}</span><strong>{fmtEur(lastYear, { maximumFractionDigits: 0 })}</strong></div>
                  <div><span>Fatture</span><strong>{fmtNum(stats.invoice_count)}</strong></div>
                  <div><span>Provvigioni totali</span><strong>{fmtEur(commAll?.total_gross || 0, { maximumFractionDigits: 0 })}</strong></div>
                </div>
                <div className="sd-chart-label">Ultimi 12 mesi</div>
                <div className="sd-bars">
                  {months.map(m => (
                    <div key={m.key} className="sd-bar-col" title={`${m.label}: ${fmtEur(m.total)}`}>
                      <div className="sd-bar-track"><div className="sd-bar" style={{ height: `${(m.total / maxMonth) * 100}%` }} /></div>
                      <div className="sd-bar-label">{m.label}</div>
                    </div>
                  ))}
                </div>
                {isGroup && byCompany.length > 0 && (
                  <>
                    <div className="sd-chart-label">Per azienda del gruppo</div>
                    <div className="cd-list">
                      {byCompany.map((r: any) => (
                        <div key={r.company_id} className="cd-list-item" onClick={() => navigate(`/companies/${r.company_id}`)}>
                          <div className="cd-list-main">
                            <div className="cd-list-title">{r.company_name || companyName(r.company_id)}</div>
                            <div className="cd-list-sub">
                              {fmtNum(r.count)} fatture
                              {commByCompany.get(r.company_id) && ` · provvigioni ${fmtEur(commByCompany.get(r.company_id).total_gross, { maximumFractionDigits: 0 })}`}
                            </div>
                          </div>
                          <span className="sd-amount">{fmtEur(r.total, { maximumFractionDigits: 0 })}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Clients */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Clienti seguiti ({followedClients.length})</h3>
            {followedClients.length > 8 && (
              <button className="cd-link" onClick={() => setShowAllClients(s => !s)}>{showAllClients ? 'Mostra meno' : 'Mostra tutti'}</button>
            )}
          </div>
          {followedClients.length === 0 ? (
            <div className="cd-empty">Nessun cliente collegato a questo fornitore</div>
          ) : (
            <div className="cd-list">
              {(showAllClients ? followedClients : followedClients.slice(0, 8)).map(c => (
                <div key={c.id} className="cd-list-item" onClick={() => navigate(`/clients/${c.id}`)}>
                  <div className="cd-list-main">
                    <div className="cd-list-title">{c.name}</div>
                    <div className="cd-list-sub">
                      {[c.city, c.country].filter(Boolean).join(', ') || '-'}
                      {c.lastVisit && ` · ultima visita ${formatDate(c.lastVisit)}`}
                    </div>
                  </div>
                  {canViewRevenue && c.revenue > 0 && <span className="sd-amount">{fmtEur(c.revenue, { maximumFractionDigits: 0 })}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supplier meetings */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Incontri con il fornitore ({meetings.length})</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="cd-link" onClick={() => navigate(`/company-visits/new?companyId=${id}&returnTo=${back}`)}>+ Crea</button>
              <button className="cd-link" onClick={() => navigate('/company-visits')}>Vedi tutti</button>
            </div>
          </div>
          {sortedMeetings.length === 0 ? (
            <div className="cd-empty">Nessun incontro registrato</div>
          ) : (
            <div className="cd-list">
              {sortedMeetings.slice(0, 5).map(m => (
                <div key={m.id} className="cd-list-item" onClick={() => navigate(`/company-visits/${m.id}`)}>
                  <div className="cd-list-main">
                    <div className="cd-list-title">{formatDate(m.date)} · {m.subject || 'Incontro'}</div>
                    <div className="cd-list-sub">
                      {isGroup && m.company_id !== id && `${companyName(m.company_id)} · `}
                      {m.created_by_user?.name || ''}
                    </div>
                  </div>
                  <span className={`cd-report-badge ${m.report ? 'ready' : 'missing'}`}>
                    {m.report ? 'Report' : MEETING_STATUS[m.status] || m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Client visits with a report for this supplier */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Visite ai clienti ({supplierVisits.length})</h3>
            <button className="cd-link" onClick={() => navigate('/visits')}>Vedi tutte</button>
          </div>
          {supplierVisits.length === 0 ? (
            <div className="cd-empty">Nessuna visita con report per questo fornitore</div>
          ) : (
            <div className="cd-list">
              {supplierVisits.slice(0, 6).map(({ v, reps }) => (
                <div key={v.id} className="cd-list-item" onClick={() => navigate(`/visits/${v.id}?highlight=${v.id}`)}>
                  <div className="cd-list-main">
                    <div className="cd-list-title">{formatDate(v.visit_date)} · {v.client?.name || '-'}</div>
                    <div className="cd-list-sub">
                      {v.visited_by_user?.name ? `di ${v.visited_by_user.name}` : ''}
                      {isGroup && ` · ${[...new Set(reps.map(r => companyName(r.company_id)))].filter(Boolean).join(', ')}`}
                    </div>
                  </div>
                  <span className="cd-report-badge ready">{reps.length} report</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Task aperti ({openTodos.length})</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="cd-link" onClick={() => navigate(`/todos/new?companyId=${id}&returnTo=${back}`)}>+ Crea</button>
              <button className="cd-link" onClick={() => navigate('/tasks')}>Vedi tutti</button>
            </div>
          </div>
          {openTodos.length === 0 ? (
            <div className="cd-empty">Nessun task aperto</div>
          ) : (
            <div className="cd-list">
              {openTodos.slice(0, 6).map(t => {
                const overdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className="cd-list-item" onClick={() => navigate(`/tasks?highlight=${t.id}`)}>
                    <div className="cd-list-main">
                      <div className="cd-list-title">{t.title}</div>
                      <div className="cd-list-sub">
                        {(t as any).client?.name || ''}
                        {t.due_date && `${(t as any).client?.name ? ' · ' : ''}scadenza ${formatDate(t.due_date)}`}
                      </div>
                    </div>
                    {overdue && <span className="cd-report-badge missing">Scaduto</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Opportunities */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Opportunità aperte ({activeOpps.length}){pipelineValue > 0 && <span className="sd-h-sub"> · {fmtEur(pipelineValue, { maximumFractionDigits: 0 })}</span>}</h3>
            <button className="cd-link" onClick={() => navigate('/opportunities')}>Vedi tutte</button>
          </div>
          {activeOpps.length === 0 ? (
            <div className="cd-empty">Nessuna opportunità aperta</div>
          ) : (
            <div className="cd-list">
              {activeOpps.slice(0, 5).map(o => (
                <div key={o.id} className="cd-list-item" onClick={() => navigate(`/opportunities/${o.id}`)}>
                  <div className="cd-list-main">
                    <div className="cd-list-title">{o.title}</div>
                    <div className="cd-list-sub">
                      {o.client?.name || '-'} · {OPP_STATUS[o.status] || o.status}
                      {o.expected_close_date && ` · chiusura ${formatDate(o.expected_close_date)}`}
                    </div>
                  </div>
                  {Number(o.estimated_value) > 0 && (
                    <span className="sd-amount">{fmtEur(o.estimated_value, { currency: o.currency || 'EUR', maximumFractionDigits: 0 })}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top articles */}
        {canViewRevenue && (stats?.top_articles || []).length > 0 && (
          <div className="cd-card">
            <div className="cd-card-header">
              <h3>Articoli più venduti</h3>
              <button className="cd-link" onClick={() => navigate('/amministrazione/fatturato')}>Articoli</button>
            </div>
            <div className="cd-list">
              {stats.top_articles.slice(0, 6).map((a: any, i: number) => (
                <div key={`${a.article_code}-${i}`} className="cd-list-item sd-static">
                  <div className="cd-list-main">
                    <div className="cd-list-title">{a.article_code}{a.description ? ` · ${a.description}` : ''}</div>
                    <div className="cd-list-sub">{fmtNum(a.total_quantity, { maximumFractionDigits: 2 })} {a.unit || ''}</div>
                  </div>
                  <span className="sd-amount">{fmtEur(a.total_revenue, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claims */}
        <div className="cd-card">
          <div className="cd-card-header">
            <h3>Reclami ({claims.length}){openClaims.length > 0 && <span className="sd-h-sub"> · {openClaims.length} aperti</span>}</h3>
            <button className="cd-link" onClick={() => navigate('/claims')}>Vedi tutti</button>
          </div>
          {claims.length === 0 ? (
            <div className="cd-empty">Nessun reclamo</div>
          ) : (
            <div className="cd-list">
              {[...claims].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(c => (
                <div key={c.id} className="cd-list-item" onClick={() => navigate(`/claims/${c.id}`)}>
                  <div className="cd-list-main">
                    <div className="cd-list-title">{formatDate(c.date)} · {c.client?.name || '-'}</div>
                    <div className="cd-list-sub">{isGroup && c.company_id !== id ? companyName(c.company_id) : ''}</div>
                  </div>
                  <span className={`cd-report-badge ${c.status === 'open' || c.status === 'in_progress' ? 'missing' : 'ready'}`}>
                    {CLAIM_STATUS[c.status] || c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price lists */}
        {canViewRevenue && (
          <div className="cd-card">
            <div className="cd-card-header">
              <h3>Listini ({priceLists.length})</h3>
              <button className="cd-link" onClick={() => navigate('/amministrazione/fatturato')}>Gestisci</button>
            </div>
            {priceLists.length === 0 ? (
              <div className="cd-empty">Nessun listino caricato</div>
            ) : (
              <div className="cd-list">
                {[...priceLists]
                  .sort((a, b) => new Date(b.valid_from || b.created_at).getTime() - new Date(a.valid_from || a.created_at).getTime())
                  .slice(0, 5)
                  .map(p => (
                    <div key={p.id} className="cd-list-item sd-static">
                      <div className="cd-list-main">
                        <div className="cd-list-title">{p.name}</div>
                        <div className="cd-list-sub">
                          {isGroup && p.company_id !== id && `${companyName(p.company_id)} · `}
                          {p.valid_from ? `valido dal ${formatDate(p.valid_from)}` : `caricato il ${formatDate(p.created_at)}`}
                        </div>
                      </div>
                      <span className="cd-report-badge ready">{fmtNum(p.article_count)} articoli</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyDetail;
