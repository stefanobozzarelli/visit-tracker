// Logica dei promemoria: separata dall'handler così si può provare senza Firebase.
// Per ogni famiglia trova le manutenzioni scadute (nextDue <= oggi) e i to-do con scadenza
// non ancora segnalati, manda UNA email riassuntiva e ricorda cosa ha già segnalato
// (campo `notifiedDue`), così lo stesso avviso non parte due volte.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const itDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

export const romeToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now); // YYYY-MM-DD

const byCol = async (items, col) => (await items.where('col', '==', col).get()).docs.map((d) => ({ ...d.data(), id: d.id }));

export function recipientsOf(hh, members) {
  const list = (hh.notifyEmails?.length ? hh.notifyEmails : members.map((m) => m.email)).filter(Boolean);
  return [...new Set(list.map((e) => e.trim().toLowerCase()))];
}

export function buildEmail({ hhName, due, appUrl }) {
  const n = due.length;
  const subject = `🏡 ${hhName || 'Casa'}: ${n} ${n === 1 ? 'manutenzione da fare' : 'manutenzioni da fare'}`;
  const line = (d) => `${d.icon ? d.icon + ' ' : ''}${d.title}${d.where ? ' — ' + d.where : ''} (scade ${itDate(d.due)})`;
  const text = `${subject}\n\n${due.map((d) => '• ' + line(d)).join('\n')}\n\nApri l'app: ${appUrl}\n`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#1c1f33">
    <h2 style="margin:0 0 12px">🏡 ${esc(hhName || 'Casa')}</h2><p>Oggi ${n === 1 ? 'c\'è una cosa' : `ci sono ${n} cose`} da fare:</p>
    <ul style="padding-left:18px">${due.map((d) => `<li style="margin:6px 0"><b>${esc(d.icon ? d.icon + ' ' : '')}${esc(d.title)}</b>${d.where ? `<br><span style="color:#6b7088">${esc(d.where)}</span>` : ''}<br><span style="color:#e5484d">scade ${esc(itDate(d.due))}</span></li>`).join('')}</ul>
    <p><a href="${esc(appUrl)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;display:inline-block">Apri Casa Manutenzione</a></p></div>`;
  return { subject, text, html };
}

// db: Firestore (admin). send({to, subject, text, html}) invia una email.
export async function runReminders({ db, send, today = romeToday(), appUrl }) {
  const report = [];
  for (const hh of (await db.collection('households').get()).docs) {
    const items = hh.ref.collection('items'); const data = hh.data();
    const [tasks, devices, props, todos, memberSnap] = await Promise.all([
      byCol(items, 'tasks'), byCol(items, 'devices'), byCol(items, 'properties'), byCol(items, 'todos'), hh.ref.collection('members').get(),
    ]);
    const dev = Object.fromEntries(devices.map((d) => [d.id, d])); const prop = Object.fromEntries(props.map((p) => [p.id, p]));
    const toSend = []; // { kind, id, due, title, icon, where }
    for (const t of tasks) {
      if (!t.nextDue || t.nextDue > today || t.notifiedDue === t.nextDue || !dev[t.deviceId]) continue;
      if (dev[t.deviceId].maintenance === false) continue; // prodotto senza manutenzione: nessun avviso
      const d = dev[t.deviceId];
      toSend.push({ col: 'tasks', id: t.id, field: t.nextDue, due: t.nextDue, title: `${d.name}: ${t.title}`, icon: d.icon, where: prop[d.propertyId]?.name });
    }
    for (const x of todos) {
      if (x.done || !x.due || x.due > today || x.notifiedDue === x.due) continue;
      toSend.push({ col: 'todos', id: x.id, field: x.due, due: x.due, title: x.title, icon: '📝', where: prop[x.propertyId]?.name });
    }
    if (!toSend.length) continue;
    const to = recipientsOf(data, memberSnap.docs.map((m) => m.data()));
    if (!to.length) { report.push({ hid: hh.id, skipped: 'nessun indirizzo email' }); continue; }
    await send({ to, ...buildEmail({ hhName: data.name, due: toSend, appUrl }) });
    for (const s of toSend) await items.doc(s.id).set({ notifiedDue: s.field }, { merge: true });
    report.push({ hid: hh.id, sent: to.length, items: toSend.length });
  }
  return report;
}
