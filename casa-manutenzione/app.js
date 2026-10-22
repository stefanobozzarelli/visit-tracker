import { CATALOG, UNIT_LABEL, PROPERTY_TYPES, LOG_TYPES } from './catalog.js';
import { LocalStore, CloudStore, uid, emptyDb, COLS } from './store.js';
import { firebaseConfig } from './firebase-config.js';

/* ============================== utilità ============================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtEUR = (n) => eur.format(Number(n) || 0);
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const todayISO = () => toISO(new Date());
const fmtDate = (iso, long) => iso ? parse(iso).toLocaleDateString('it-IT', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const daysUntil = (iso) => Math.round((parse(iso) - parse(todayISO())) / 864e5);
const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const MAX_PDF = 3 * 1048576;
// Le foto vengono ridotte (max 1600px, JPEG) per stare nei limiti gratuiti del database.
async function prepareFile(file) {
  if (file.type.startsWith('image/')) {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.72));
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  }
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF) throw new Error(`“${file.name}” supera 3 MB: comprimilo o scattagli una foto`);
    return { blob: file, name: file.name };
  }
  throw new Error(`“${file.name}”: sono ammessi solo foto e PDF`);
}
async function openAtt(att) {
  try {
    const blob = await S.store.getFile(att); if (!blob) throw new Error('vuoto');
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { console.error(e); toast('Impossibile aprire il file'); }
}
const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function addInterval(iso, n, u) {
  const d = parse(iso);
  if (u === 'days') d.setDate(d.getDate() + n);
  else if (u === 'weeks') d.setDate(d.getDate() + 7 * n);
  else {
    const months = u === 'years' ? 12 * n : n; const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return toISO(d);
}
const recurText = (t) => !t.every || !t.unit ? 'A consumo (senza scadenza)'
  : `Ogni ${t.every === 1 ? UNIT_LABEL[t.unit][0] : `${t.every} ${UNIT_LABEL[t.unit][1]}`}`;

function dueInfo(iso) {
  const d = daysUntil(iso);
  if (d < 0) return { cls: 'red', txt: `Scaduto da ${-d} ${-d === 1 ? 'giorno' : 'giorni'}`, d };
  if (d === 0) return { cls: 'red', txt: 'Scade oggi', d };
  if (d === 1) return { cls: 'amber', txt: 'Domani', d };
  if (d <= 14) return { cls: 'amber', txt: `Tra ${d} giorni`, d };
  return { cls: 'green', txt: fmtDate(iso), d };
}

/* ============================== stato ============================== */
const PREF_KEY = 'casa.prefs.v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const prefs = { theme: 'auto', accent: '#4f46e5', accent2: '#a855f7', name: '', ...loadPrefs() };
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

const S = {
  db: emptyDb(), store: null, view: 'home', prop: '', hf: { prop: '', dev: '', type: '', year: '', q: '' },
  ready: false, hhName: '', members: [], hh: {}, remindedDay: null,
};
const ACCENTS = [['#4f46e5', '#a855f7'], ['#0d9488', '#2dd4bf'], ['#ea580c', '#f59e0b'], ['#e11d48', '#fb7185'], ['#16a34a', '#84cc16'], ['#0284c7', '#38bdf8']];

function applyPrefs() {
  const r = document.documentElement;
  r.dataset.theme = prefs.theme;
  r.style.setProperty('--accent', prefs.accent); r.style.setProperty('--accent-2', prefs.accent2);
  const soft = prefs.theme === 'dark' ? null : `color-mix(in srgb, ${prefs.accent} 11%, white)`;
  soft ? r.style.setProperty('--accent-soft', soft) : r.style.removeProperty('--accent-soft');
  const meta = $('meta[name=theme-color]'); if (meta) meta.content = prefs.accent;
}

const P = (id) => S.db.properties.find((x) => x.id === id);
const D = (id) => S.db.devices.find((x) => x.id === id);
const T = (id) => S.db.tasks.find((x) => x.id === id);
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'it');
const propIcon = (p) => p?.icon || PROPERTY_TYPES.find((t) => t.id === p?.type)?.icon || '🏡';
const meName = () => (S.store?.mode === 'cloud' && S.store.user ? (S.store.user.displayName || (S.store.user.email || '').split('@')[0]) : '') || prefs.name || '';
const inProp = (propertyId) => !S.prop || propertyId === S.prop;
const tasksScheduled = () => S.db.tasks.filter((t) => t.nextDue && D(t.deviceId) && inProp(D(t.deviceId).propertyId))
  .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
const logsFiltered = () => S.db.logs.filter((l) => inProp(l.propertyId));

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}
const save = async (col, item) => { try { await S.store.put(col, item); } catch (e) { console.error(e); toast('Errore nel salvataggio: ' + (e.message || e)); } };
const remove = async (col, id) => { try { await S.store.del(col, id); } catch (e) { console.error(e); toast('Errore: ' + (e.message || e)); } };

/* ============================== dialog ============================== */
const dlg = $('#dlg');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
function modal(title, body, buttons = []) {
  dlg.innerHTML = `<form class="dlg" id="f" novalidate>
    <header><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="Chiudi">✕</button></header>
    <div class="content">${body}</div>
    ${buttons.length ? `<footer>${buttons.map((b, i) => `<button type="${b.submit ? 'submit' : 'button'}" class="btn ${b.cls || ''}" data-btn="${i}">${b.label}</button>`).join('')}</footer>` : ''}
  </form>`;
  const f = $('#f', dlg);
  const run = async (b) => { const keep = await b.onClick?.(new FormData(f), f); if (keep !== false) dlg.close(); };
  f.addEventListener('submit', (e) => { e.preventDefault(); const sb = buttons.find((b) => b.submit); if (sb) run(sb); });
  buttons.forEach((b, i) => { if (!b.submit) $(`[data-btn="${i}"]`, f).addEventListener('click', () => run(b)); });
  if (!dlg.open) dlg.showModal();
  return f;
}
function confirmDlg(title, text, label, fn) {
  modal(esc(title), `<p>${text}</p>`, [{ label: 'Annulla' }, { label, cls: 'danger', submit: true, onClick: fn }]);
}
const fd = (f, k) => (f.get(k) ?? '').toString().trim();
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;

/* ============================== render ============================== */
const root = $('#root');
const NAV = [['home', '🏠', 'Home'], ['piano', '🗓️', 'Piano'], ['dev', '🧰', 'Dispositivi'], ['storico', '🧾', 'Storico'], ['set', '⚙️', 'Altro']];

function render() {
  if (!S.ready) return;
  const scroll = window.scrollY;
  const views = { home: vHome, piano: vPiano, dev: vDevices, storico: vHistory, set: vSettings };
  root.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="icons/icon-192.png" alt="">Casa Manutenzione</div>
      ${NAV.map(([k, ic, l]) => `<button class="navbtn ${S.view === k ? 'on' : ''}" data-act="nav" data-v="${k}"><span>${ic}</span>${l}</button>`).join('')}
      <div class="grow"></div>
      <div class="userbox">${S.store.mode === 'cloud' ? `👪 ${esc(S.hhName)}<br>${esc(meName())}` : '📱 Dati solo su questo dispositivo'}</div>
    </aside>
    <main class="main">${views[S.view]()}</main>
    <nav class="tabbar">${NAV.map(([k, ic, l]) => `<button class="tab ${S.view === k ? 'on' : ''}" data-act="nav" data-v="${k}"><span class="ic">${ic}</span>${l}</button>`).join('')}</nav>
    ${S.db.properties.length ? `<button class="fab" data-act="newlog"><span>＋</span> Registra</button>` : ''}
  </div>`;
  if (S.view === 'storico') renderHistoryList();
  window.scrollTo(0, scroll);
}

function propChips() {
  if (S.db.properties.length < 2) return '';
  return `<div class="chips"><button class="chip ${!S.prop ? 'on' : ''}" data-act="setprop" data-id="">Tutte</button>
    ${S.db.properties.slice().sort(byName).map((p) => `<button class="chip ${S.prop === p.id ? 'on' : ''}" data-act="setprop" data-id="${p.id}">${propIcon(p)} ${esc(p.name)}</button>`).join('')}</div>`;
}

function taskRow(t, { showDevice = true } = {}) {
  const dev = D(t.deviceId); const di = t.nextDue ? dueInfo(t.nextDue) : null;
  const prop = P(dev?.propertyId); const kind = LOG_TYPES[t.kind] || LOG_TYPES.programmata;
  return `<div class="row">
    <div class="ico">${esc(dev?.icon || '🧰')}</div>
    <div class="body" data-act="${showDevice ? 'devsheet' : 'edittask'}" data-id="${showDevice ? dev?.id : t.id}" data-dev="${dev?.id}">
      <div class="t">${esc(t.title)}</div>
      <div class="s">${showDevice ? `${esc(dev?.name)} · ${prop ? esc(prop.name) + ' · ' : ''}` : ''}${kind.icon} ${esc(recurText(t))}</div>
      ${di ? `<span class="pill ${di.cls}">${esc(di.txt)}</span>` : ''}
    </div>
    <button class="done" title="Segna come fatto" data-act="complete" data-id="${t.id}">✓</button>
  </div>`;
}

function logRow(l) {
  const dev = D(l.deviceId); const ty = LOG_TYPES[l.type] || LOG_TYPES.programmata; const prop = P(l.propertyId);
  return `<div class="row">
    <div class="ico">${esc(dev?.icon || l.deviceIcon || ty.icon)}</div>
    <div class="body" data-act="editlog" data-id="${l.id}">
      <div class="t">${esc(l.title)}</div>
      <div class="s">${esc(dev?.name || l.deviceName || 'Generico')}${prop ? ' · ' + esc(prop.name) : ''} · ${fmtDate(l.date)}${l.by ? ' · ' + esc(l.by) : ''}</div>
      <span class="pill ${ty.color}">${ty.icon} ${ty.label}</span>${l.provider ? ` <span class="pill">🔧 ${esc(l.provider)}</span>` : ''}${l.attachments?.length ? ` <span class="pill">📎 ${l.attachments.length}</span>` : ''}
    </div>
    <div class="amt">${l.cost ? fmtEUR(l.cost) : ''}</div>
  </div>`;
}

function todoRow(x) {
  const di = x.due ? dueInfo(x.due) : null; const p = P(x.propertyId);
  return `<div class="row"><div class="ico">📝</div>
    <div class="body" data-act="edittodo" data-id="${x.id}"><div class="t">${esc(x.title)}</div>
      <div class="s">${p ? esc(p.name) + ' · ' : ''}${esc(x.notes || 'To-do')}${x.by ? ' · ' + esc(x.by) : ''}</div>${di ? `<span class="pill ${di.cls}">${esc(di.txt)}</span>` : ''}</div>
    <button class="done" title="Fatto" data-act="todoDone" data-id="${x.id}">✓</button></div>`;
}

function emptyState(icon, title, text, btn) {
  return `<div class="card empty"><div class="big">${icon}</div><h3>${title}</h3><p>${text}</p>${btn || ''}</div>`;
}

/* ---------- Home ---------- */
function greeting() {
  const h = new Date().getHours(); const g = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  return meName() ? `${g}, ${esc(meName().split(' ')[0])}` : g;
}

function vHome() {
  if (!S.db.properties.length) return vWelcome();
  const sched = tasksScheduled(); const logs = logsFiltered();
  const over = sched.filter((t) => daysUntil(t.nextDue) < 0);
  const soon = sched.filter((t) => { const d = daysUntil(t.nextDue); return d >= 0 && d <= 30; });
  const y = new Date().getFullYear(); const m = new Date().getMonth();
  const inYear = logs.filter((l) => l.date?.startsWith(String(y)));
  const spendYear = inYear.reduce((s, l) => s + (+l.cost || 0), 0);
  const spendMonth = inYear.filter((l) => +l.date.slice(5, 7) === m + 1).reduce((s, l) => s + (+l.cost || 0), 0);
  const dueNow = sched.filter((t) => daysUntil(t.nextDue) <= 0);
  const upcoming = sched.filter((t) => { const d = daysUntil(t.nextDue); return d > 0 && d <= 45; });
  const manual = (S.db.todos || []).filter((x) => !x.done && (!S.prop || !x.propertyId || x.propertyId === S.prop))
    .sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const msg = over.length ? `Hai ${over.length} ${over.length === 1 ? 'attività scaduta' : 'attività scadute'} da sistemare.`
    : soon.length ? `${soon.length} ${soon.length === 1 ? 'attività' : 'attività'} nei prossimi 30 giorni.` : 'Tutto in ordine, nessuna scadenza imminente. 🎉';

  const perMonth = Array(12).fill(0); inYear.forEach((l) => { perMonth[+l.date.slice(5, 7) - 1] += +l.cost || 0; });
  const maxM = Math.max(...perMonth, 1);
  const perType = Object.keys(LOG_TYPES).map((k) => [k, inYear.filter((l) => l.type === k).reduce((s, l) => s + (+l.cost || 0), 0)]);
  const perDev = {}; inYear.forEach((l) => { const k = D(l.deviceId)?.name || l.deviceName || 'Generico'; perDev[k] = (perDev[k] || 0) + (+l.cost || 0); });
  const topDev = Object.entries(perDev).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxD = Math.max(...topDev.map((x) => x[1]), 1);

  return `<div class="hero"><h2>${greeting()} 👋</h2><p>${msg}</p></div>
    ${propChips()}
    <div class="kpis">
      <div class="kpi ${over.length ? 'red' : 'green'}"><div class="v">${over.length}</div><div class="l">Scadute</div></div>
      <div class="kpi ${soon.length ? 'amber' : ''}"><div class="v">${soon.length}</div><div class="l">Nei prossimi 30 gg</div></div>
      <div class="kpi"><div class="v">${fmtEUR(spendMonth)}</div><div class="l">Spesa ${MONTHS[m]}</div></div>
      <div class="kpi"><div class="v">${fmtEUR(spendYear)}</div><div class="l">Spesa ${y}</div></div>
    </div>
    <div class="sec"><h2>To-do <span class="muted" style="font-weight:600">${dueNow.length + manual.length || ''}</span></h2><button class="btn sm" data-act="addtodo">＋ To-do</button></div>
    ${dueNow.length || manual.length ? dueNow.map((t) => taskRow(t)).join('') + manual.map(todoRow).join('') :
      emptyState('✅', 'Nessun to-do', 'Quando una manutenzione scade compare qui da sola e la famiglia riceve un\'email. Puoi aggiungere anche to-do tuoi.')}
    <div class="sec"><h2>In arrivo</h2><button class="btn sm" data-act="nav" data-v="piano">Tutto il piano</button></div>
    ${upcoming.length ? upcoming.slice(0, 6).map((t) => taskRow(t)).join('') :
      emptyState('🗓️', 'Nessuna scadenza nei prossimi 45 giorni', 'Aggiungi dispositivi e manutenzioni programmate per vedere qui le prossime scadenze.',
        `<button class="btn primary" data-act="adddev">Aggiungi dispositivo</button>`)}
    <div class="grid two">
      <div><div class="sec"><h2>Spesa mensile ${y}</h2></div><div class="card">
        <div class="bars">${perMonth.map((v, i) => `<div class="bar ${i === m ? 'cur' : ''}" title="${MONTHS[i]}: ${fmtEUR(v)}"><i style="height:${Math.max(Math.round(v / maxM * 88), 3)}px"></i>${MONTHS[i][0]}</div>`).join('')}</div>
      </div></div>
      <div><div class="sec"><h2>Dove spendi</h2></div><div class="card">
        ${perType.map(([k, v]) => `<div class="hb"><span>${LOG_TYPES[k].icon} ${LOG_TYPES[k].label}</span><div class="track"><div class="fill" style="width:${v / (spendYear || 1) * 100}%"></div></div><b>${fmtEUR(v)}</b></div>`).join('')}
        ${topDev.length ? `<div class="lbl" style="margin-top:12px">Top dispositivi</div>${topDev.map(([k, v]) => `<div class="hb"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v / maxD * 100}%"></div></div><b>${fmtEUR(v)}</b></div>`).join('')}` : ''}
      </div></div>
    </div>
    <div class="sec"><h2>Ultimi interventi</h2><button class="btn sm" data-act="nav" data-v="storico">Storico</button></div>
    ${logs.length ? logs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(logRow).join('') : emptyState('🧾', 'Nessun intervento registrato', 'Tocca “Registra” per segnare il primo, ad esempio il cambio del sale.')}`;
}

function vWelcome() {
  return `<div class="hero"><h2>Benvenuto in Casa Manutenzione</h2><p>Tieni sotto controllo manutenzioni, consumabili e spese di casa tua.</p></div>
    <div class="sec"><h2>Da dove iniziamo?</h2></div>
    <div class="card"><p class="muted" style="margin-top:0">Aggiungi la tua prima abitazione:</p>
      <div class="catgrid">${PROPERTY_TYPES.map((t) => `<button class="catitem" data-act="addprop" data-type="${t.id}"><span class="e">${t.icon}</span>${t.label}</button>`).join('')}</div>
      <p class="muted">Poi aggiungerai i dispositivi (addolcitore, caldaia, stampante…) con le manutenzioni già suggerite.</p>
      <button class="btn" data-act="sample">✨ Prova con dati di esempio</button></div>`;
}

/* ---------- Piano ---------- */
function vPiano() {
  const sched = tasksScheduled();
  const groups = [['Scadute', (d) => d < 0], ['Questa settimana', (d) => d >= 0 && d <= 7], ['Entro 30 giorni', (d) => d > 7 && d <= 30],
    ['Entro 3 mesi', (d) => d > 30 && d <= 92], ['Più avanti', (d) => d > 92]];
  const unscheduled = S.db.tasks.filter((t) => !t.nextDue && D(t.deviceId) && inProp(D(t.deviceId).propertyId));
  return `<div class="top"><h1>Piano di manutenzione</h1></div>${propChips()}
    ${sched.length || unscheduled.length ? '' : emptyState('🗓️', 'Nessuna attività programmata', 'Aggiungi un dispositivo: ti proporremo le manutenzioni tipiche con le relative scadenze.', `<button class="btn primary" data-act="adddev">Aggiungi dispositivo</button>`)}
    ${groups.map(([name, fn]) => { const list = sched.filter((t) => fn(daysUntil(t.nextDue))); return list.length ? `<div class="month"><span>${name}</span><span>${list.length}</span></div>${list.map((t) => taskRow(t)).join('')}` : ''; }).join('')}
    ${unscheduled.length ? `<div class="month"><span>A consumo (senza scadenza)</span><span>${unscheduled.length}</span></div>${unscheduled.map((t) => taskRow(t)).join('')}` : ''}`;
}

/* ---------- Dispositivi ---------- */
function vDevices() {
  const props = S.db.properties.slice().sort(byName).filter((p) => inProp(p.id));
  return `<div class="top"><h1>Dispositivi</h1><button class="btn primary" data-act="adddev">＋ Aggiungi</button></div>${propChips()}
    ${!S.db.properties.length ? vWelcome() : props.map((p) => {
      const devs = S.db.devices.filter((d) => d.propertyId === p.id).sort(byName);
      return `<div class="prophead"><span class="pi">${propIcon(p)}</span><div><h2>${esc(p.name)}</h2><div class="muted" style="font-size:13px">${esc(p.address || PROPERTY_TYPES.find((t) => t.id === p.type)?.label || '')}</div></div></div>
        ${devs.length ? `<div class="grid cards">${devs.map(devCard).join('')}</div>` : emptyState('🧰', 'Nessun dispositivo', 'Aggiungi i dispositivi di questa abitazione.', `<button class="btn primary" data-act="adddev" data-prop="${p.id}">Aggiungi dispositivo</button>`)}`;
    }).join('')}`;
}

function devCard(d) {
  const tasks = S.db.tasks.filter((t) => t.deviceId === d.id && t.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const next = tasks[0]; const di = next && dueInfo(next.nextDue);
  const spent = S.db.logs.filter((l) => l.deviceId === d.id).reduce((s, l) => s + (+l.cost || 0), 0);
  return `<div class="devcard" data-act="devsheet" data-id="${d.id}">
    <div class="devhead"><div class="ico">${esc(d.icon)}</div><div><div class="n">${esc(d.name)}</div><div class="m">${esc([d.brand, d.model].filter(Boolean).join(' ') || 'Nessun modello indicato')}</div></div></div>
    <div>${next ? `<span class="pill ${di.cls}">${esc(next.title)} · ${esc(di.txt)}</span>` : '<span class="pill">Nessuna scadenza</span>'}</div>
    <div class="muted" style="font-size:13px">Speso in totale: <b>${fmtEUR(spent)}</b></div>
  </div>`;
}

/* ---------- Storico ---------- */
function vHistory() {
  const years = [...new Set(S.db.logs.map((l) => l.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const f = S.hf;
  return `<div class="top"><h1>Storico interventi</h1><button class="btn sm" data-act="csv">⬇️ CSV</button></div>
    <div class="sticky-filters">
      <select id="hf-prop" data-hf="prop"><option value="">Tutte le case</option>${S.db.properties.map((p) => opt(p.id, p.name, f.prop === p.id)).join('')}</select>
      <select id="hf-dev" data-hf="dev"><option value="">Tutti i dispositivi</option>${S.db.devices.slice().sort(byName).map((d) => opt(d.id, d.name, f.dev === d.id)).join('')}</select>
      <select id="hf-type" data-hf="type"><option value="">Tutti i tipi</option>${Object.entries(LOG_TYPES).map(([k, v]) => opt(k, v.label, f.type === k)).join('')}</select>
      <select id="hf-year" data-hf="year"><option value="">Tutti gli anni</option>${years.map((y) => opt(y, y, f.year === y)).join('')}</select>
      <input id="hf-q" data-hf="q" type="search" placeholder="Cerca…" value="${esc(f.q)}">
    </div>
    <div id="histlist"></div>`;
}
function historyFiltered() {
  const f = S.hf; const q = f.q.toLowerCase();
  return S.db.logs.filter((l) => (!f.prop || l.propertyId === f.prop) && (!f.dev || l.deviceId === f.dev) && (!f.type || l.type === f.type)
    && (!f.year || l.date?.startsWith(f.year))
    && (!q || [l.title, l.notes, l.provider, l.by, D(l.deviceId)?.name, l.deviceName].some((x) => (x || '').toLowerCase().includes(q))))
    .sort((a, b) => b.date.localeCompare(a.date));
}
function renderHistoryList() {
  const list = historyFiltered(); const el = $('#histlist'); if (!el) return;
  if (!list.length) { el.innerHTML = emptyState('🧾', 'Nessun intervento trovato', 'Cambia i filtri oppure registra un nuovo intervento.'); return; }
  const total = list.reduce((s, l) => s + (+l.cost || 0), 0);
  let html = `<div class="card" style="display:flex;justify-content:space-between;margin-bottom:6px"><span><b>${list.length}</b> interventi</span><span>Totale <b>${fmtEUR(total)}</b></span></div>`;
  let cur = '';
  for (const l of list) {
    const k = l.date.slice(0, 7);
    if (k !== cur) {
      cur = k; const mt = list.filter((x) => x.date.startsWith(k)).reduce((s, x) => s + (+x.cost || 0), 0);
      html += `<div class="month"><span>${parse(k + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span><span>${fmtEUR(mt)}</span></div>`;
    }
    html += logRow(l);
  }
  el.innerHTML = html;
}

/* ---------- Impostazioni ---------- */
function vSettings() {
  const cloud = S.store.mode === 'cloud';
  return `<div class="top"><h1>Altro</h1></div>
  <div class="card"><h3>Profilo</h3>
    <div class="field"><label>Il tuo nome (appare negli interventi che registri)</label>
    <input id="pname" value="${esc(prefs.name)}" placeholder="es. Stefano" ${cloud ? 'disabled' : ''}></div>
    ${cloud ? `<p class="muted">Account: ${esc(S.store.user?.email || '')}</p>` : ''}</div>

  <div class="sec"><h2>Abitazioni</h2><button class="btn sm" data-act="addprop">＋ Aggiungi</button></div>
  ${S.db.properties.slice().sort(byName).map((p) => `<div class="row"><div class="ico">${propIcon(p)}</div>
    <div class="body" data-act="editprop" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.address || PROPERTY_TYPES.find((t) => t.id === p.type)?.label || '')} · ${S.db.devices.filter((d) => d.propertyId === p.id).length} dispositivi</div></div>
    <button class="iconbtn" data-act="editprop" data-id="${p.id}">✎</button></div>`).join('') || '<p class="muted">Nessuna abitazione.</p>'}

  <div class="sec"><h2>Aspetto</h2></div>
  <div class="card">
    <div class="lbl">Tema</div>
    <div class="seg" style="margin:6px 0 14px">${[['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([k, l]) => `<button type="button" class="${prefs.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="lbl">Colore</div>
    <div class="swatches" style="margin-top:8px">${ACCENTS.map(([a, b]) => `<button class="sw ${prefs.accent === a ? 'on' : ''}" style="background:linear-gradient(135deg,${a},${b})" data-act="accent" data-a="${a}" data-b="${b}" aria-label="${a}"></button>`).join('')}</div>
  </div>

  <div class="sec"><h2>Promemoria</h2></div>
  <div class="card">
    <p style="margin-top:0">Ricevi gli avvisi delle scadenze sul telefono con il calendario: l'evento si ripete da solo e ti avvisa il giorno prima.</p>
    <div class="btnrow"><button class="btn" data-act="ics">📅 Esporta scadenze (.ics)</button>
    <button class="btn" data-act="notif">🔔 Notifiche all'apertura${('Notification' in window && Notification.permission === 'granted') ? ' ✓' : ''}</button></div>
  </div>

  <div class="sec"><h2>Famiglia</h2></div>
  <div class="card">${cloud ? `<p style="margin-top:0">👪 <b>${esc(S.hhName)}</b> — i dati sono condivisi in tempo reale.</p>
      <div class="lbl">Codice di invito (da dare ai familiari)</div>
      <div style="display:flex;gap:8px;margin:6px 0 12px"><input readonly value="${esc(S.store.hid)}" id="invite" style="font-weight:800;letter-spacing:.08em"><button class="btn" data-act="copyinvite">Copia</button></div>
      <div class="lbl">Membri</div><div>${S.members.map((m) => `<span class="pill" style="margin:4px 4px 0 0">👤 ${esc(m.name || m.email)}</span>`).join('') || '—'}</div>
      <div class="btnrow" style="margin-top:14px"><button class="btn" data-act="signout">Esci</button><button class="btn danger" data-act="leavehh">Lascia la famiglia</button></div>`
    : `<p style="margin-top:0">Ora i dati sono salvati <b>solo in questo browser</b>. Per condividerli con la famiglia online serve collegare un database Firebase (gratuito, 5 minuti): vedi <code>README.md</code> nella cartella dell'app.</p>`}</div>

  <div class="sec"><h2>Email di promemoria</h2></div>
  <div class="card">${cloud ? `<p style="margin-top:0">Ogni mattina, se una manutenzione è scaduta, parte un'email a questi indirizzi (uno per riga). Se lasci vuoto vengono usate le email dei membri.</p>
    <textarea id="emails" rows="3" placeholder="mamma@esempio.it&#10;papà@esempio.it">${esc((S.hh.notifyEmails?.length ? S.hh.notifyEmails : S.members.map((m) => m.email).filter(Boolean)).join('\n'))}</textarea>
    <div class="btnrow" style="margin-top:10px"><button class="btn primary" data-act="saveemails">Salva indirizzi</button><button class="btn" data-act="testmail">✉️ Invia email di prova</button></div>`
    : `<p style="margin:0">Le email automatiche funzionano con l'account famiglia online (sezione Famiglia).</p>`}</div>

  <div class="sec"><h2>Dati</h2></div>
  <div class="card"><div class="btnrow">
    <button class="btn" data-act="export">⬇️ Backup (JSON)</button>
    <button class="btn" data-act="import">⬆️ Ripristina backup</button>
    <button class="btn" data-act="csv">🧾 Esporta spese (CSV)</button>
    <button class="btn danger" data-act="wipe">🗑️ Cancella tutto</button></div>
    <input type="file" id="importfile" accept="application/json" class="hidden"></div>
  <p class="muted" style="text-align:center;margin-top:24px">Casa Manutenzione</p>`;
}

/* ============================== azioni ============================== */
const actions = {
  close: () => dlg.close(),
  nav: (d) => { S.view = d.v; render(); window.scrollTo(0, 0); },
  setprop: (d) => { S.prop = d.id; render(); },
  theme: (d) => { prefs.theme = d.v; savePrefs(); applyPrefs(); render(); },
  accent: (d) => { prefs.accent = d.a; prefs.accent2 = d.b; savePrefs(); applyPrefs(); render(); },
  newlog: () => logForm({}),
  complete: (d) => { const t = T(d.id); if (t) logForm({ taskId: t.id }); },
  edittask: (d) => taskForm(d.dev, d.id),
  devsheet: (d) => d.id && deviceSheet(d.id),
  adddev: (d) => deviceCatalog(d.prop),
  addprop: (d) => propForm(null, d.type),
  editprop: (d) => propForm(d.id),
  editlog: (d) => logForm({ id: d.id }),
  csv: exportCSV, export: exportJSON, ics: exportICS, sample: loadSample,
  import: () => $('#importfile').click(),
  notif: enableNotifications,
  addtodo: () => todoForm(), edittodo: (d) => todoForm(d.id),
  todoDone: async (d) => { const x = (S.db.todos || []).find((t) => t.id === d.id); if (x) { await save('todos', { ...x, done: true, doneAt: todayISO(), by: meName() }); toast('To-do completato'); } },
  saveemails: async () => {
    const list = [...new Set($('#emails').value.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (list.some((e) => !/^\S+@\S+\.\S+$/.test(e))) { toast('Controlla gli indirizzi email'); return; }
    try { await S.store.setNotifyEmails(list); S.hh.notifyEmails = list; toast(list.length ? 'Indirizzi salvati' : 'Userò le email dei membri'); } catch (e) { toast('Errore: ' + e.message); }
  },
  testmail: async () => {
    toast('Invio in corso…');
    try {
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await S.store.idToken() }, body: JSON.stringify({ hid: S.store.hid }) });
      const j = await res.json().catch(() => ({}));
      toast(res.ok ? `Email di prova inviata a ${j.sent} indirizzi` : (j.error || 'Invio non riuscito'));
    } catch { toast('Servizio email non raggiungibile'); }
  },
  copyinvite: async () => { try { await navigator.clipboard.writeText(S.store.hid); toast('Codice copiato'); } catch { $('#invite').select(); } },
  signout: async () => { await S.store.signOut(); location.reload(); },
  leavehh: () => confirmDlg('Lasciare la famiglia?', 'Non vedrai più i dati condivisi. Gli altri membri li conservano.', 'Lascia', async () => { await S.store.leaveHousehold(); location.reload(); }),
  wipe: () => confirmDlg('Cancellare tutto?', 'Verranno eliminati abitazioni, dispositivi, piani e storico' + (S.store.mode === 'cloud' ? ' <b>per tutta la famiglia</b>' : '') + '. Operazione irreversibile: fai prima un backup.', 'Cancella tutto', async () => {
    for (const c of COLS) for (const x of [...S.db[c]]) await remove(c, x.id);
    toast('Dati cancellati');
  }),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  e.preventDefault(); const fn = actions[el.dataset.act]; if (fn) fn(el.dataset, el);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.hf) { S.hf[el.dataset.hf] = el.value; renderHistoryList(); }
  else if (el.id === 'importfile') importJSON(el.files[0]);
  else if (el.id === 'pname') { prefs.name = el.value.trim(); savePrefs(); toast('Nome salvato'); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'hf-q') { S.hf.q = e.target.value; renderHistoryList(); } });

/* ---------- Abitazioni ---------- */
function propForm(id, type) {
  const p = id ? P(id) : { type: type || 'casa' };
  const f = modal(id ? 'Modifica abitazione' : 'Nuova abitazione', `
    <div class="field"><label>Nome</label><input name="name" required placeholder="es. Casa di Milano" value="${esc(p.name || '')}"></div>
    <div class="field"><label>Tipo</label><select name="type">${PROPERTY_TYPES.map((t) => opt(t.id, `${t.icon} ${t.label}`, p.type === t.id)).join('')}</select></div>
    <div class="field"><label>Indirizzo (facoltativo)</label><input name="address" value="${esc(p.address || '')}"></div>`,
  [...(id ? [{ label: 'Elimina', cls: 'danger', onClick: () => { setTimeout(() => confirmDlg('Eliminare l\'abitazione?', 'Verranno eliminati anche i suoi dispositivi e i piani di manutenzione. Lo storico resta.', 'Elimina', async () => {
      for (const d of S.db.devices.filter((x) => x.propertyId === id)) { for (const t of S.db.tasks.filter((x) => x.deviceId === d.id)) await remove('tasks', t.id); await remove('devices', d.id); }
      await remove('properties', id); if (S.prop === id) S.prop = ''; }), 0); } }] : []),
  { label: 'Annulla' }, { label: 'Salva', cls: 'primary', submit: true, onClick: async (v) => {
    if (!fd(v, 'name')) { toast('Inserisci un nome'); return false; }
    await save('properties', { ...p, id: p.id || uid(), name: fd(v, 'name'), type: fd(v, 'type'), address: fd(v, 'address') });
    toast('Abitazione salvata'); } }]);
  setTimeout(() => $('[name=name]', f)?.focus(), 50);
}

/* ---------- Dispositivi ---------- */
function deviceCatalog(propId) {
  if (!S.db.properties.length) { toast('Aggiungi prima un\'abitazione'); return propForm(); }
  const body = `<input type="search" id="catq" placeholder="Cerca (es. addolcitore, caldaia…)" style="margin-bottom:6px">
    <div id="catlist">${CATALOG.map((g) => `<div class="month"><span>${g.group}</span></div><div class="catgrid">${g.items.map((i) => `<button type="button" class="catitem" data-cat="${i.id}" data-q="${esc((i.name + ' ' + g.group).toLowerCase())}"><span class="e">${i.icon}</span>${esc(i.name)}</button>`).join('')}</div>`).join('')}</div>`;
  const f = modal('Che dispositivo vuoi aggiungere?', body, [{ label: 'Chiudi' }]);
  $('#catq', f).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    f.querySelectorAll('.catitem').forEach((b) => b.classList.toggle('hidden', !!q && !b.dataset.q.includes(q)));
  });
  f.querySelectorAll('.catitem').forEach((b) => b.addEventListener('click', () => {
    const item = CATALOG.flatMap((g) => g.items).find((i) => i.id === b.dataset.cat); deviceForm(null, item, propId);
  }));
}

function deviceForm(dev, cat, propId) {
  const d = dev || { name: cat.name === 'Altro (personalizzato)' ? '' : cat.name, icon: cat.icon, propertyId: propId || S.prop || S.db.properties[0]?.id };
  const tasks = !dev && cat ? cat.tasks : [];
  const f = modal(dev ? 'Modifica dispositivo' : 'Nuovo dispositivo', `
    <div class="two-col"><div class="field"><label>Icona</label><input name="icon" value="${esc(d.icon)}" maxlength="4" style="text-align:center;font-size:22px"></div>
      <div class="field"><label>Abitazione</label><select name="propertyId">${S.db.properties.slice().sort(byName).map((p) => opt(p.id, `${propIcon(p)} ${p.name}`, p.id === d.propertyId)).join('')}</select></div></div>
    <div class="field"><label>Nome</label><input name="name" required value="${esc(d.name)}" placeholder="es. Addolcitore cucina"></div>
    <div class="two-col"><div class="field"><label>Marca</label><input name="brand" value="${esc(d.brand || '')}"></div>
      <div class="field"><label>Modello</label><input name="model" value="${esc(d.model || '')}"></div></div>
    <div class="two-col"><div class="field"><label>Data di installazione</label><input type="date" name="installDate" value="${esc(d.installDate || '')}"></div>
      <div class="field"><label>Scadenza garanzia</label><input type="date" name="warranty" value="${esc(d.warranty || '')}"></div></div>
    <div class="field"><label>Note (seriale, fornitore, posizione…)</label><textarea name="notes">${esc(d.notes || '')}</textarea></div>
    ${tasks.length ? `<div class="lbl" style="margin-top:16px">Manutenzioni suggerite — spunta quelle che vuoi</div>
      ${tasks.map((t, i) => `<label class="taskpick"><input type="checkbox" name="task${i}" checked><span class="tt">${esc(t.t)}<small>${LOG_TYPES[t.k].icon} ${LOG_TYPES[t.k].label} · ${esc(recurText({ every: t.n, unit: t.u }))}</small></span></label>`).join('')}
      <div class="field"><label>Prima scadenza</label><select name="start"><option value="later">Tra un intervallo da oggi (l'ho appena fatto / è nuovo)</option><option value="today">Subito, scade oggi</option></select></div>
      <p class="muted" style="font-size:13px">Potrai cambiare frequenze e scadenze quando vuoi.</p>` : ''}`,
  [...(dev ? [{ label: 'Elimina', cls: 'danger', onClick: () => { setTimeout(() => confirmDlg('Eliminare il dispositivo?', 'Verranno eliminati anche i suoi piani di manutenzione. Lo storico degli interventi resta.', 'Elimina', async () => {
      for (const t of S.db.tasks.filter((x) => x.deviceId === dev.id)) await remove('tasks', t.id); await remove('devices', dev.id); toast('Dispositivo eliminato'); }), 0); } }] : []),
  { label: 'Annulla' }, { label: 'Salva', cls: 'primary', submit: true, onClick: async (v) => {
    if (!fd(v, 'name')) { toast('Inserisci un nome'); return false; }
    const item = { ...d, id: d.id || uid(), name: fd(v, 'name'), icon: fd(v, 'icon') || '🧰', propertyId: fd(v, 'propertyId'),
      brand: fd(v, 'brand'), model: fd(v, 'model'), installDate: fd(v, 'installDate'), warranty: fd(v, 'warranty'), notes: fd(v, 'notes') };
    await save('devices', item);
    if (dev) {
      for (const l of S.db.logs.filter((x) => x.deviceId === dev.id && x.propertyId !== item.propertyId)) await save('logs', { ...l, propertyId: item.propertyId });
    }
    const now = todayISO();
    for (let i = 0; i < tasks.length; i++) {
      if (!v.get('task' + i)) continue; const t = tasks[i];
      const due = t.n && t.u ? (fd(v, 'start') === 'today' ? now : addInterval(now, t.n, t.u)) : '';
      await save('tasks', { id: uid(), deviceId: item.id, title: t.t, kind: t.k, every: t.n, unit: t.u, nextDue: due, lastDone: '', cost: '', notes: '' });
    }
    toast(dev ? 'Dispositivo aggiornato' : 'Dispositivo aggiunto');
    if (!dev) setTimeout(() => deviceSheet(item.id), 150);
  } }]);
  setTimeout(() => $('[name=name]', f)?.focus(), 50);
}

function deviceSheet(id) {
  const d = D(id); if (!d) return;
  const tasks = S.db.tasks.filter((t) => t.deviceId === id).sort((a, b) => (a.nextDue || '9').localeCompare(b.nextDue || '9'));
  const logs = S.db.logs.filter((l) => l.deviceId === id).sort((a, b) => b.date.localeCompare(a.date));
  const spent = logs.reduce((s, l) => s + (+l.cost || 0), 0); const prop = P(d.propertyId);
  const f = modal(`${esc(d.icon)} ${esc(d.name)}`, `
    <div class="muted" style="margin-bottom:10px">${prop ? propIcon(prop) + ' ' + esc(prop.name) : ''}${d.brand || d.model ? ' · ' + esc([d.brand, d.model].filter(Boolean).join(' ')) : ''}
      ${d.installDate ? '<br>Installato il ' + fmtDate(d.installDate) : ''}${d.warranty ? ' · garanzia fino al ' + fmtDate(d.warranty) : ''}${d.notes ? '<br>' + esc(d.notes) : ''}</div>
    <div class="btnrow"><button type="button" class="btn sm primary" data-x="log">＋ Registra intervento</button><button type="button" class="btn sm" data-x="edit">✎ Modifica</button></div>
    <div class="sec"><h2>Manutenzioni programmate</h2><button type="button" class="btn sm" data-x="addtask">＋ Aggiungi</button></div>
    ${tasks.length ? tasks.map((t) => taskRow(t, { showDevice: false })).join('') : '<p class="muted">Nessuna manutenzione programmata.</p>'}
    <div class="sec"><h2>Storico (${fmtEUR(spent)})</h2></div>
    ${logs.length ? logs.slice(0, 8).map(logRow).join('') : '<p class="muted">Ancora nessun intervento.</p>'}`, [{ label: 'Chiudi' }]);
  $('[data-x=log]', f).onclick = () => logForm({ deviceId: id });
  $('[data-x=edit]', f).onclick = () => deviceForm(d);
  $('[data-x=addtask]', f).onclick = () => taskForm(id);
}

/* ---------- Piani di manutenzione ---------- */
function taskForm(deviceId, taskId) {
  const t = taskId ? T(taskId) : { kind: 'programmata', every: 6, unit: 'months', nextDue: addInterval(todayISO(), 6, 'months') };
  const d = D(deviceId); const rec = !(t.every === null || t.every === '' || t.unit === null) && t.unit !== '';
  const f = modal(taskId ? 'Modifica manutenzione' : 'Nuova manutenzione', `
    <div class="muted" style="margin-bottom:6px">${esc(d?.icon)} ${esc(d?.name)}</div>
    <div class="field"><label>Cosa si fa</label><input name="title" required value="${esc(t.title || '')}" placeholder="es. Reintegro sale rigenerante"></div>
    <div class="field"><label>Tipo</label><div class="seg" id="kindseg">
      <button type="button" data-k="consumabile" class="${t.kind === 'consumabile' ? 'on' : ''}">🧂 Consumabile</button>
      <button type="button" data-k="programmata" class="${t.kind !== 'consumabile' ? 'on' : ''}">🗓️ Programmata</button></div></div>
    <div class="field"><label>Frequenza</label><div class="two-col" style="grid-template-columns:90px 1fr 1fr">
      <input type="number" min="1" name="every" value="${esc(rec ? t.every : 1)}">
      <select name="unit">${Object.entries(UNIT_LABEL).map(([k, v]) => opt(k, v[1], t.unit === k)).join('')}</select>
      <select name="rec"><option value="1" ${rec ? 'selected' : ''}>Ricorrente</option><option value="0" ${!rec ? 'selected' : ''}>A consumo</option></select></div></div>
    <div class="two-col"><div class="field"><label>Prossima scadenza</label><input type="date" name="nextDue" value="${esc(t.nextDue || '')}"></div>
      <div class="field"><label>Costo stimato (€)</label><input type="number" step="0.01" min="0" name="cost" value="${esc(t.cost || '')}"></div></div>
    <div class="field"><label>Note</label><textarea name="notes">${esc(t.notes || '')}</textarea></div>`,
  [...(taskId ? [{ label: 'Elimina', cls: 'danger', onClick: async () => { await remove('tasks', taskId); toast('Manutenzione eliminata'); } }] : []),
    { label: 'Annulla' }, { label: 'Salva', cls: 'primary', submit: true, onClick: async (v) => {
      if (!fd(v, 'title')) { toast('Inserisci una descrizione'); return false; }
      const recurring = fd(v, 'rec') === '1'; const every = Math.max(1, parseInt(fd(v, 'every'), 10) || 1);
      await save('tasks', { ...t, id: t.id || uid(), deviceId, title: fd(v, 'title'), kind: $('#kindseg .on', f).dataset.k,
        every: recurring ? every : null, unit: recurring ? fd(v, 'unit') : null, nextDue: fd(v, 'nextDue'), cost: fd(v, 'cost'), notes: fd(v, 'notes'), lastDone: t.lastDone || '' });
      toast('Manutenzione salvata');
    } }]);
  $('#kindseg', f).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; f.querySelectorAll('#kindseg button').forEach((x) => x.classList.toggle('on', x === b)); });
}

/* ---------- Registro interventi ---------- */
function logForm({ id, deviceId, taskId }) {
  const editing = id ? S.db.logs.find((l) => l.id === id) : null;
  const task = taskId ? T(taskId) : null;
  const l = editing || {
    date: todayISO(), type: task ? (task.kind === 'consumabile' ? 'consumabile' : 'programmata') : 'programmata',
    title: task?.title || '', deviceId: task?.deviceId || deviceId || '', taskId: task?.id || '', cost: task?.cost || '',
  };
  const atts = [...(l.attachments || [])]; const pending = []; const removed = [];
  const dev0 = D(l.deviceId);
  l.propertyId = l.propertyId || dev0?.propertyId || (S.prop || S.db.properties[0]?.id);
  const props = S.db.properties.slice().sort(byName);
  const f = modal(editing ? 'Modifica intervento' : task ? 'Segna come fatto' : 'Registra intervento', `
    <div class="field"><label>Tipo di intervento</label><div class="seg" id="typeseg">
      ${Object.entries(LOG_TYPES).map(([k, v]) => `<button type="button" data-k="${k}" class="${l.type === k ? 'on' : ''}">${v.icon} ${v.label}</button>`).join('')}</div></div>
    <div class="two-col"><div class="field"><label>Abitazione</label><select name="propertyId" id="lp">${props.map((p) => opt(p.id, `${propIcon(p)} ${p.name}`, p.id === l.propertyId)).join('')}</select></div>
      <div class="field"><label>Dispositivo</label><select name="deviceId" id="ld"></select></div></div>
    <div class="field"><label>Cosa è stato fatto</label><input name="title" id="lt" list="tl" required value="${esc(l.title)}" placeholder="es. Cambio sale addolcitore"><datalist id="tl"></datalist></div>
    <div class="two-col"><div class="field"><label>Data</label><input type="date" name="date" value="${esc(l.date)}"></div>
      <div class="field"><label>Importo (€)</label><input type="number" step="0.01" min="0" name="cost" inputmode="decimal" value="${esc(l.cost || '')}"></div></div>
    <div class="field"><label>Ditta / dove l'hai acquistato</label><input name="provider" value="${esc(l.provider || '')}" placeholder="es. Idraulico Rossi, Leroy Merlin"></div>
    <div class="field"><label>Note</label><textarea name="notes">${esc(l.notes || '')}</textarea></div>
    <div class="field" id="linkwrap"><label>Aggiorna la scadenza di</label><select name="taskId" id="lk"></select></div>
    <div class="field"><label>Allegati (fattura, distinta lavori, foto…)</label><div id="attlist"></div>
      <label class="btn sm" for="attfile" style="width:fit-content">📎 Aggiungi file</label>
      <input type="file" id="attfile" class="vh" multiple accept="image/*,application/pdf"></div>`,
  [...(editing ? [{ label: 'Elimina', cls: 'danger', onClick: async () => {
      for (const a of editing.attachments || []) await S.store.delFile(a).catch(() => {});
      await remove('logs', id); toast('Intervento eliminato'); } }] : []),
    { label: 'Annulla' }, { label: 'Salva', cls: 'primary', submit: true, onClick: async (v) => {
      const title = fd(v, 'title'); if (!title) { toast('Descrivi l\'intervento'); return false; }
      const type = $('#typeseg .on', f).dataset.k; const devId = fd(v, 'deviceId'); const dv = D(devId);
      const date = fd(v, 'date') || todayISO(); const tId = type === 'straordinaria' ? '' : fd(v, 'taskId');
      const newAtts = [];
      try {
        if (pending.length) {
          toast('Caricamento allegati…');
          for (const file of pending) {
            const { blob, name } = await prepareFile(file); const aid = uid(); const { chunks } = await S.store.putFile(aid, blob);
            newAtts.push({ id: aid, name, type: blob.type, size: blob.size, chunks });
          }
        }
      } catch (e) { console.error(e); toast(e.message || 'Allegato non caricato'); return false; }
      for (const a of removed) await S.store.delFile(a).catch(() => {});
      const item = { ...l, attachments: [...atts, ...newAtts], id: l.id || uid(), type, title, date, cost: fd(v, 'cost'), provider: fd(v, 'provider'), notes: fd(v, 'notes'),
        propertyId: fd(v, 'propertyId'), deviceId: devId, deviceName: dv?.name || '', deviceIcon: dv?.icon || '', taskId: tId, by: l.by || meName() };
      await save('logs', item);
      const tk = tId && T(tId);
      if (!editing && tk && (!tk.lastDone || date >= tk.lastDone)) {
        await save('tasks', { ...tk, lastDone: date, nextDue: tk.every && tk.unit ? addInterval(date, tk.every, tk.unit) : '' });
        toast(tk.every && tk.unit ? `Fatto! Prossima scadenza: ${fmtDate(addInterval(date, tk.every, tk.unit))}` : 'Intervento registrato');
      } else toast('Intervento salvato');
    } }]);

  const lp = $('#lp', f), ld = $('#ld', f), lk = $('#lk', f), lt = $('#tl', f);
  const drawAtt = () => {
    $('#attlist', f).innerHTML = [...atts.map((a, i) => `<div class="taskpick"><span class="tt">📄 ${esc(a.name)}<small>${fmtSize(a.size)}</small></span>
        <button type="button" class="btn sm" data-x="open" data-i="${i}">Apri</button><button type="button" class="iconbtn danger" data-x="rm" data-i="${i}" aria-label="Rimuovi">✕</button></div>`),
      ...pending.map((p, i) => `<div class="taskpick"><span class="tt">🆕 ${esc(p.name)}<small>${fmtSize(p.size)} · da caricare al salvataggio</small></span>
        <button type="button" class="iconbtn danger" data-x="unp" data-i="${i}" aria-label="Rimuovi">✕</button></div>`)].join('');
  };
  $('#attlist', f).addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return; const i = +b.dataset.i;
    if (b.dataset.x === 'open') openAtt(atts[i]);
    else if (b.dataset.x === 'rm') { removed.push(atts[i]); atts.splice(i, 1); drawAtt(); }
    else { pending.splice(i, 1); drawAtt(); }
  });
  $('#attfile', f).addEventListener('change', (e) => {
    for (const file of e.target.files) { if (atts.length + pending.length >= 10) { toast('Massimo 10 allegati'); break; } pending.push(file); }
    e.target.value = ''; drawAtt();
  });
  drawAtt();
  const fillDevices = () => {
    const devs = S.db.devices.filter((d) => d.propertyId === lp.value).sort(byName);
    ld.innerHTML = `<option value="">— Generico (nessun dispositivo) —</option>` + devs.map((d) => opt(d.id, `${d.icon} ${d.name}`, d.id === l.deviceId)).join('');
    fillTasks();
  };
  const fillTasks = () => {
    const ts = S.db.tasks.filter((t) => t.deviceId === ld.value);
    lt.innerHTML = ts.map((t) => `<option value="${esc(t.title)}">`).join('');
    lk.innerHTML = `<option value="">— Nessuna —</option>` + ts.map((t) => opt(t.id, `${t.title} (${recurText(t)})`, t.id === l.taskId)).join('');
    syncLink();
  };
  const syncLink = () => { $('#linkwrap', f).classList.toggle('hidden', $('#typeseg .on', f).dataset.k === 'straordinaria' || !lk.options.length || lk.options.length < 2 || !!editing); };
  lp.addEventListener('change', () => { l.deviceId = ''; fillDevices(); });
  ld.addEventListener('change', () => { l.taskId = ''; fillTasks(); });
  lk.addEventListener('change', () => { const t = T(lk.value); if (t) { if (!$('#lt', f).value) $('#lt', f).value = t.title; if (t.cost && !f.elements.cost.value) f.elements.cost.value = t.cost; } });
  $('#typeseg', f).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; f.querySelectorAll('#typeseg button').forEach((x) => x.classList.toggle('on', x === b)); syncLink(); });
  fillDevices();
}

/* ---------- To-do manuali ---------- */
function todoForm(id) {
  const x = id ? (S.db.todos || []).find((t) => t.id === id) : { due: '' };
  const f = modal(id ? 'Modifica to-do' : 'Nuovo to-do', `
    <div class="field"><label>Cosa c'è da fare</label><input name="title" required value="${esc(x.title || '')}" placeholder="es. Chiamare l'idraulico"></div>
    <div class="two-col"><div class="field"><label>Entro il (facoltativo)</label><input type="date" name="due" value="${esc(x.due || '')}"></div>
      <div class="field"><label>Abitazione</label><select name="propertyId"><option value="">Tutte</option>${S.db.properties.map((p) => opt(p.id, p.name, p.id === x.propertyId)).join('')}</select></div></div>
    <div class="field"><label>Note</label><textarea name="notes">${esc(x.notes || '')}</textarea></div>`,
  [...(id ? [{ label: 'Elimina', cls: 'danger', onClick: async () => { await remove('todos', id); toast('To-do eliminato'); } }] : []),
    { label: 'Annulla' }, { label: 'Salva', cls: 'primary', submit: true, onClick: async (v) => {
      if (!fd(v, 'title')) { toast('Scrivi cosa c\'è da fare'); return false; }
      await save('todos', { ...x, id: x.id || uid(), title: fd(v, 'title'), due: fd(v, 'due'), propertyId: fd(v, 'propertyId'), notes: fd(v, 'notes'), done: false, by: x.by || meName() });
      toast('To-do salvato'); } }]);
  setTimeout(() => $('[name=title]', f)?.focus(), 50);
}

/* ============================== import / export ============================== */
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportJSON() { download(`casa-manutenzione-${todayISO()}.json`, JSON.stringify({ app: 'casa-manutenzione', version: 1, ...S.db }, null, 2), 'application/json'); }

function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Data', 'Abitazione', 'Dispositivo', 'Tipo', 'Intervento', 'Importo', 'Ditta', 'Chi', 'Note']];
  S.db.logs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((l) => rows.push([l.date, P(l.propertyId)?.name || '', D(l.deviceId)?.name || l.deviceName || '',
    LOG_TYPES[l.type]?.label || l.type, l.title, String(l.cost || '').replace('.', ','), l.provider, l.by, l.notes]));
  download(`spese-casa-${todayISO()}.csv`, '\ufeff' + rows.map((r) => r.map(q).join(';')).join('\r\n'), 'text/csv');
}

async function importJSON(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!COLS.some((c) => Array.isArray(data[c]))) throw new Error('File non valido');
    confirmDlg('Ripristinare il backup?', `Contiene ${data.properties?.length || 0} abitazioni, ${data.devices?.length || 0} dispositivi, ${data.logs?.length || 0} interventi. <b>I dati attuali verranno sostituiti.</b>`, 'Ripristina', async () => {
      await S.store.replaceAll(Object.fromEntries(COLS.map((c) => [c, data[c] || []]))); toast('Backup ripristinato');
    });
  } catch (e) { toast('Impossibile leggere il file'); }
  $('#importfile').value = '';
}

function exportICS() {
  const sched = S.db.tasks.filter((t) => t.nextDue && D(t.deviceId));
  if (!sched.length) { toast('Nessuna scadenza da esportare'); return; }
  const fold = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const freq = { days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY' };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = sched.map((t) => {
    const d = D(t.deviceId); const s = t.nextDue.replace(/-/g, ''); const e = addInterval(t.nextDue, 1, 'days').replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${t.id}@casa-manutenzione`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${s}`, `DTEND;VALUE=DATE:${e}`,
      `SUMMARY:${fold(`${d.icon} ${d.name}: ${t.title}`)}`, `DESCRIPTION:${fold(`${P(d.propertyId)?.name || ''} — ${recurText(t)}`)}`,
      ...(t.every && t.unit ? [`RRULE:FREQ=${freq[t.unit]};INTERVAL=${t.every}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Manutenzione', 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  download('manutenzioni-casa.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casa Manutenzione//IT', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
  toast('Apri il file per aggiungere le scadenze al calendario');
}

/* ============================== notifiche ============================== */
async function enableNotifications() {
  if (!('Notification' in window)) { toast('Notifiche non supportate: usa l\'export per il calendario'); return; }
  const r = await Notification.requestPermission();
  toast(r === 'granted' ? 'Notifiche attivate' : 'Notifiche non consentite'); render(); if (r === 'granted') remind(true);
}
async function remind(force) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const day = todayISO(); if (!force && S.remindedDay === day) return;
  const due = S.db.tasks.filter((t) => t.nextDue && daysUntil(t.nextDue) <= 0 && D(t.deviceId));
  if (!due.length) return; S.remindedDay = day;
  const body = due.slice(0, 4).map((t) => `${D(t.deviceId).name}: ${t.title}`).join('\n');
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = { body, icon: 'icons/icon-192.png', tag: 'casa-due' };
  reg ? reg.showNotification(`🏡 ${due.length} manutenzioni da fare`, opts) : new Notification(`🏡 ${due.length} manutenzioni da fare`, opts);
}

/* ============================== dati di esempio ============================== */
async function loadSample() {
  const pid = uid(); const now = todayISO();
  await save('properties', { id: pid, name: 'Casa di famiglia', type: 'casa', address: '' });
  const mk = async (catId, extra = {}) => {
    const c = CATALOG.flatMap((g) => g.items).find((i) => i.id === catId); const did = uid();
    await save('devices', { id: did, propertyId: pid, name: c.name, icon: c.icon, brand: extra.brand || '', model: '', installDate: '', warranty: '', notes: '' });
    const out = [];
    for (const [i, t] of c.tasks.entries()) {
      const off = extra.offsets?.[i];
      const tk = { id: uid(), deviceId: did, title: t.t, kind: t.k, every: t.n, unit: t.u, nextDue: t.n ? addInterval(now, off ?? t.n, off !== undefined ? 'days' : t.u) : '', lastDone: '', cost: '', notes: '' };
      await save('tasks', tk); out.push(tk);
    }
    return { did, c, out };
  };
  const log = (dev, type, title, daysAgo, cost, provider) => save('logs', { id: uid(), type, title, date: addInterval(now, -daysAgo, 'days'), cost: String(cost), provider: provider || '',
    notes: '', propertyId: pid, deviceId: dev.did, deviceName: dev.c.name, deviceIcon: dev.c.icon, taskId: '', by: meName() });
  const add = await mk('addolcitore', { brand: 'Culligan', offsets: [-3, 60, 200] });
  const cal = await mk('caldaia', { brand: 'Vaillant', offsets: [12, 40] });
  const lav = await mk('lavatrice', { offsets: [25, 25] });
  await mk('stampante', { brand: 'HP' });
  await log(add, 'consumabile', 'Cambio sale rigenerante (3 sacchi)', 62, 18.9, 'Brico');
  await log(add, 'consumabile', 'Cambio sale rigenerante (3 sacchi)', 124, 18.9, 'Brico');
  await log(cal, 'programmata', 'Manutenzione annuale e analisi fumi', 150, 95, 'Termoidraulica Bianchi');
  await log(lav, 'straordinaria', 'Sostituzione pompa di scarico', 40, 120, 'Assistenza Rossi');
  toast('Dati di esempio caricati');
}

/* ============================== avvio e accesso ============================== */
function authScreen(msg = '') {
  S.ready = false;
  root.innerHTML = `<div class="auth"><div class="card">
    <img src="icons/icon-192.png" alt=""><h1>Casa Manutenzione</h1><p class="muted" style="margin-top:0">Accedi per vedere la manutenzione di casa insieme alla tua famiglia.</p>
    <button class="btn primary block" id="g">Continua con Google</button>
    <div class="muted" style="text-align:center;margin:14px 0">oppure con email</div>
    <form id="ef" novalidate><div class="field"><label>Email</label><input type="email" name="email" autocomplete="email"></div>
      <div class="field"><label>Password (min. 6 caratteri)</label><input type="password" name="pw" autocomplete="current-password"></div>
      <div class="err" id="err">${esc(msg)}</div>
      <div class="btnrow"><button class="btn primary" id="in" style="flex:1">Accedi</button><button type="button" class="btn" id="up" style="flex:1">Crea account</button></div></form>
  </div></div>`;
  const err = (e) => { $('#err').textContent = ({ 'auth/invalid-credential': 'Email o password errata', 'auth/email-already-in-use': 'Email già registrata: usa Accedi', 'auth/weak-password': 'Password troppo corta (min. 6)', 'auth/invalid-email': 'Email non valida', 'auth/popup-closed-by-user': '' })[e.code] ?? (e.message || 'Errore'); };
  const val = () => { const f = new FormData($('#ef')); return [f.get('email').trim(), f.get('pw')]; };
  $('#g').onclick = () => S.store.signInGoogle().catch(err);
  $('#ef').onsubmit = (e) => { e.preventDefault(); S.store.signInEmail(...val()).catch(err); };
  $('#up').onclick = () => S.store.signUpEmail(...val()).catch(err);
}

function householdScreen() {
  S.ready = false;
  const localHas = (() => { try { const r = JSON.parse(localStorage.getItem('casa.db.v1')); return r && COLS.some((c) => r[c]?.length); } catch { return false; } })();
  root.innerHTML = `<div class="auth"><div class="card">
    <img src="icons/icon-192.png" alt=""><h1>La tua famiglia</h1><p class="muted" style="margin-top:0">Ciao ${esc(meName())}! Crea una nuova casa condivisa, oppure unisciti con il codice che ti ha dato un familiare.</p>
    <div class="field"><label>Crea nuova famiglia</label><input id="hn" placeholder="es. Famiglia Rossi"></div>
    ${localHas ? '<label class="taskpick"><input type="checkbox" id="mig" checked><span class="tt">Porta qui i dati già salvati su questo dispositivo</span></label>' : ''}
    <button class="btn primary block" id="mk">Crea e inizia</button>
    <div class="muted" style="text-align:center;margin:16px 0">oppure</div>
    <div class="field"><label>Ho un codice invito</label><input id="hc" placeholder="es. k3m9x2qp7a" style="letter-spacing:.08em"></div>
    <button class="btn block" id="jn">Unisciti</button><div class="err" id="err"></div>
    <div style="text-align:center;margin-top:10px"><button class="btn sm" id="so">Esci</button></div></div></div>`;
  $('#so').onclick = () => S.store.signOut();
  $('#mk').onclick = async () => {
    try {
      await S.store.createHousehold($('#hn').value.trim() || 'La mia famiglia');
      const mig = $('#mig')?.checked && JSON.parse(localStorage.getItem('casa.db.v1'));
      startCloud();
      if (mig) { for (const c of COLS) for (const x of mig[c] || []) await S.store.put(c, x); }
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#jn').onclick = async () => {
    try { const code = $('#hc').value.trim(); if (!code) return; await S.store.joinHousehold(code); startCloud(); }
    catch (e) { $('#err').textContent = e.message?.includes('permission') ? 'Codice non valido' : e.message; }
  };
}

async function startCloud() {
  S.store.unsub?.();
  S.hhName = await S.store.householdName().catch(() => '');
  S.members = await S.store.members().catch(() => []);
  S.hh = await S.store.household().catch(() => ({}));
  S.store.subscribe((db) => { S.db = db; S.ready = true; render(); remind(); });
}

async function boot() {
  applyPrefs();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  const startLocal = () => { S.store = new LocalStore(); S.store.subscribe((db) => { S.db = db; S.ready = true; render(); remind(); }); };
  if (!firebaseConfig) return startLocal();
  try {
    S.store = new CloudStore(firebaseConfig); await S.store.init();
  } catch (e) { console.error(e); toast('Sincronizzazione non disponibile: modalità locale'); return startLocal(); }
  S.store.onUser(async (u) => {
    if (!u) { S.store.unsub?.(); return authScreen(); }
    try {
      const hid = await S.store.loadHousehold();
      if (!hid) return householdScreen();
      startCloud();
    } catch (e) { console.error(e); authScreen('Errore di accesso al database: ' + (e.message || e)); }
  });
}
boot();
