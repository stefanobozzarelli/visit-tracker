// Funzione Vercel.
//  GET  /api/reminders  -> eseguita ogni mattina da Vercel Cron (vercel.json); protetta da CRON_SECRET.
//  POST /api/reminders  -> pulsante "Invia email di prova" dell'app; richiede il login Firebase di un membro.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';
import { runReminders, recipientsOf, romeToday } from '../lib/reminders.js';

const need = (k) => { if (!process.env[k]) throw Object.assign(new Error(`Manca la variabile ${k} su Vercel`), { status: 500 }); return process.env[k]; };

function init() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(need('FIREBASE_SERVICE_ACCOUNT'))) });
  return getFirestore();
}
function mailer() {
  const user = need('SMTP_USER'); const pass = need('SMTP_PASS');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return (m) => t.sendMail({ from: `Casa Manutenzione <${user}>`, ...m });
}
const appUrl = (req) => process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.headers.authorization !== `Bearer ${need('CRON_SECRET')}`) return res.status(401).json({ error: 'Non autorizzato' });
      const report = await runReminders({ db: init(), send: mailer(), appUrl: appUrl(req) });
      return res.status(200).json({ ok: true, today: romeToday(), report });
    }
    if (req.method === 'POST') {
      const db = init(); const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const { uid } = await getAuth().verifyIdToken(token).catch(() => { throw Object.assign(new Error('Accesso non valido: rientra nell\'app'), { status: 401 }); });
      const hid = String(req.body?.hid || '');
      const hh = db.collection('households').doc(hid);
      if (!hid || !(await hh.collection('members').doc(uid).get()).exists) return res.status(403).json({ error: 'Non fai parte di questa famiglia' });
      const data = (await hh.get()).data() || {};
      const to = recipientsOf(data, (await hh.collection('members').get()).docs.map((m) => m.data()));
      if (!to.length) return res.status(400).json({ error: 'Aggiungi almeno un indirizzo email e salva' });
      await mailer()({ to, subject: '✅ Casa Manutenzione: email di prova', text: 'Funziona! Riceverai qui gli avvisi quando una manutenzione scade.\n' + appUrl(req),
        html: `<p>✅ <b>Funziona!</b> Riceverai qui gli avvisi quando una manutenzione scade.</p><p><a href="${appUrl(req)}">Apri l'app</a></p>` });
      return res.status(200).json({ ok: true, sent: to.length });
    }
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'Errore del server: ' + (e.message || e) });
  }
}
