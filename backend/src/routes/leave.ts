import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { Company } from '../entities/Company';
import { LeaveEntry } from '../entities/LeaveEntry';
import { CompanyClosure } from '../entities/CompanyClosure';
import { CustomHoliday } from '../entities/CustomHoliday';
import { HolidayService, LEAVE_COUNTRIES, isValidCountry, countWorkingDays, addDays } from '../services/HolidayService';

/**
 * Ferie — leave planner of the Primula office.
 * - Collaborators (users with leave_enabled) mark their own leave.
 * - Leave admins (leave_admin, and always the master admin) manage everyone's.
 * - Supplier closures (totale / uffici / produzione / spedizioni / campioni).
 * - Holidays of Italy (+ Sassuolo patron) and the Asian countries we work with.
 * - A private iCal feed per user, to subscribe from Google Calendar.
 */
const router = Router();
const holidays = new HolidayService();

export const LEAVE_TYPES = ['ferie', 'permesso', 'malattia', 'trasferta', 'altro'];
const PERIODS = ['full', 'am', 'pm'];
export const CLOSURE_SCOPES = ['totale', 'uffici', 'produzione', 'spedizioni', 'campioni'];
const PALETTE = ['#4A6078', '#5B8A65', '#B07040', '#8A5B86', '#3F8C8C', '#A65959', '#6E7FB0', '#9C8A3E', '#5E7D4A', '#B0607F', '#4F6F9E', '#7A6A5A'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: any): s is string => typeof s === 'string' && DATE_RE.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const day = (d: any) => String(d).slice(0, 10);

interface LeaveCtx { id: string; name: string; role: string; enabled: boolean; admin: boolean; leaveOnly: boolean }
declare global {
  namespace Express { interface Request { leave?: LeaveCtx } }
}

const users = () => AppDataSource.getRepository(User);
const entries = () => AppDataSource.getRepository(LeaveEntry);
const closures = () => AppDataSource.getRepository(CompanyClosure);
const customHolidays = () => AppDataSource.getRepository(CustomHoliday);

async function loadCtx(userId: string): Promise<LeaveCtx | null> {
  const u = await users().findOne({ where: { id: userId } });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    enabled: !!u.leave_enabled,
    admin: u.role === 'master_admin' || !!u.leave_admin,
    leaveOnly: !!u.leave_only,
  };
}

// Access: collaborators in the calendar, and leave admins
async function leaveAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = await loadCtx(req.user!.id);
    if (!ctx || (!ctx.enabled && !ctx.admin)) {
      return res.status(403).json({ success: false, error: 'Non hai accesso al calendario ferie' });
    }
    req.leave = ctx;
    next();
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
}

function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.leave?.admin) return res.status(403).json({ success: false, error: 'Riservato ai responsabili ferie' });
  next();
}

function rangeFromQuery(req: Request): { from: string; to: string } | null {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!isDate(from) || !isDate(to) || from > to) return null;
  if (Date.parse(to) - Date.parse(from) > 3 * 366 * 86400000) return null;
  return { from, to };
}

function publicPerson(u: User, i: number) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    color: u.leave_color || PALETTE[i % PALETTE.length],
    leave_enabled: !!u.leave_enabled,
    leave_admin: u.role === 'master_admin' || !!u.leave_admin,
    leave_only: !!u.leave_only,
    role: u.role,
  };
}

async function people(onlyEnabled = true) {
  const list = await users().find({ order: { name: 'ASC' } });
  // Stable default colours: by position among everyone, not only the filtered list
  return list.map((u, i) => publicPerson(u, i)).filter(p => !onlyEnabled || p.leave_enabled);
}

function serializeEntry(e: LeaveEntry, office: Set<string>) {
  const start = day(e.start_date);
  const end = day(e.end_date);
  return {
    id: e.id,
    user_id: e.user_id,
    start_date: start,
    end_date: end,
    type: e.type,
    period: e.period,
    note: e.note,
    created_by: e.created_by,
    working_days: countWorkingDays(start, end, e.period, office),
  };
}

function serializeClosure(c: CompanyClosure) {
  return {
    id: c.id,
    company_id: c.company_id,
    company_name: c.company?.name || '',
    company_country: c.company?.country || '',
    start_date: day(c.start_date),
    end_date: day(c.end_date),
    scopes: c.scopes || [],
    note: c.note,
    created_by: c.created_by,
  };
}

// ---------------------------------------------------------------------------
// Public: iCal feed (secret token in the URL — Google Calendar cannot log in)
// GET /api/leave/calendar/:token.ics?l=1&mine=0&c=1&it=1&asia=1
// ---------------------------------------------------------------------------
function icsEscape(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsFold(line: string) {
  // Lines longer than 75 octets are folded (RFC 5545)
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const icsDate = (d: string) => d.replace(/-/g, '');

const TYPE_LABEL: Record<string, string> = { ferie: 'Ferie', permesso: 'Permesso', malattia: 'Malattia', trasferta: 'Trasferta', altro: 'Assenza' };
const PERIOD_LABEL: Record<string, string> = { am: ' (mattina)', pm: ' (pomeriggio)', full: '' };
const SCOPE_LABEL: Record<string, string> = { totale: 'Chiusura totale', uffici: 'Uffici', produzione: 'Produzione', spedizioni: 'Spedizioni', campioni: 'Campioni' };

router.get('/calendar/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').replace(/\.ics$/i, '');
    if (!/^[a-f0-9]{40,}$/.test(token)) return res.status(404).send('Not found');
    const owner = await users()
      .createQueryBuilder('u')
      .addSelect('u.leave_ics_token')
      .where('u.leave_ics_token = :token', { token })
      .getOne();
    const ctx = owner ? await loadCtx(owner.id) : null;
    if (!ctx || (!ctx.enabled && !ctx.admin)) return res.status(404).send('Not found');

    const flag = (k: string, def: boolean) => (req.query[k] === undefined ? def : req.query[k] === '1');
    const withLeaves = flag('l', true);
    const onlyMine = flag('mine', false);
    const withClosures = flag('c', true);
    const withIT = flag('it', true);
    const withAsia = flag('asia', true);

    const year = new Date().getFullYear();
    const from = `${year - 1}-01-01`;
    const to = `${year + 1}-12-31`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TradeFlow//Ferie Primula//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape(onlyMine ? 'Le mie ferie – Primula' : 'Ferie Primula')}`,
      'X-WR-TIMEZONE:Europe/Rome',
      'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
      'X-PUBLISHED-TTL:PT4H',
    ];
    const event = (uid: string, start: string, end: string, summary: string, description?: string, busy = false) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}@tradeflow-ferie`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(end, 1))}`);
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
      lines.push(`TRANSP:${busy ? 'OPAQUE' : 'TRANSPARENT'}`);
      lines.push('END:VEVENT');
    };

    if (withLeaves) {
      const names = new Map((await people(false)).map(p => [p.id, p.name]));
      const qb = entries().createQueryBuilder('e').where('e.end_date >= :from', { from });
      if (onlyMine) qb.andWhere('e.user_id = :uid', { uid: ctx.id });
      for (const e of await qb.getMany()) {
        const what = (TYPE_LABEL[e.type] || 'Assenza') + (PERIOD_LABEL[e.period] || '');
        const mine = e.user_id === ctx.id;
        event(`leave-${e.id}`, day(e.start_date), day(e.end_date),
          onlyMine ? what : `${names.get(e.user_id) || '—'} – ${what}`, e.note || undefined, mine);
      }
    }
    if (withClosures) {
      const list = await closures().createQueryBuilder('c').leftJoinAndSelect('c.company', 'company')
        .where('c.end_date >= :from', { from }).getMany();
      for (const c of list) {
        const label = c.scopes?.includes('totale')
          ? 'chiusura totale'
          : `chiusi: ${(c.scopes || []).map(s => SCOPE_LABEL[s] || s).join(', ')}`;
        event(`closure-${c.id}`, day(c.start_date), day(c.end_date), `🏭 ${c.company?.name || 'Azienda'} – ${label}`, c.note || undefined);
      }
    }
    const countries = LEAVE_COUNTRIES.map(c => c.code).filter(c => (c === 'IT' ? withIT : withAsia));
    if (countries.length) {
      const flags = new Map(LEAVE_COUNTRIES.map(c => [c.code, c.flag]));
      for (const h of await holidays.getHolidays(from, to, countries)) {
        const hash = crypto.createHash('md5').update(h.name).digest('hex').slice(0, 8);
        event(`hol-${h.country}-${h.date}-${hash}`, h.date, h.date, `${flags.get(h.country) || ''} ${h.country} – ${h.name}`.trim());
      }
    }
    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="ferie-primula.ics"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(lines.map(icsFold).join('\r\n') + '\r\n');
  } catch (e) {
    console.error('ICS feed error:', (e as Error).message);
    res.status(500).send('Error');
  }
});

// Everything below needs a logged-in collaborator or leave admin
router.use(authMiddleware, leaveAccess);

// ---- Context: who am I, collaborators, companies, countries ----
router.get('/bootstrap', async (req: Request, res: Response) => {
  try {
    const [ppl, companies] = await Promise.all([
      people(true),
      AppDataSource.getRepository(Company).find({ select: ['id', 'name', 'country'] as any, order: { name: 'ASC' } }),
    ]);
    res.json({
      success: true,
      data: {
        me: { id: req.leave!.id, name: req.leave!.name, enabled: req.leave!.enabled, admin: req.leave!.admin, master: req.leave!.role === 'master_admin' },
        people: ppl,
        companies,
        countries: LEAVE_COUNTRIES,
        types: LEAVE_TYPES,
        scopes: CLOSURE_SCOPES,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Everything in a period (planner view) ----
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const range = rangeFromQuery(req);
    if (!range) return res.status(400).json({ success: false, error: 'Periodo non valido' });
    const { from, to } = range;
    const [list, cl, hol, office] = await Promise.all([
      entries().createQueryBuilder('e')
        .where('e.start_date <= :to AND e.end_date >= :from', { from, to })
        .orderBy('e.start_date', 'ASC').getMany(),
      closures().createQueryBuilder('c').leftJoinAndSelect('c.company', 'company')
        .where('c.start_date <= :to AND c.end_date >= :from', { from, to })
        .orderBy('c.start_date', 'ASC').getMany(),
      holidays.getHolidays(from, to),
      // Working days are counted over whole periods, which may cross the range ends
      holidays.officeHolidaySet(addDays(from, -400), addDays(to, 400)),
    ]);
    res.json({
      success: true,
      data: {
        entries: list.map(e => serializeEntry(e, office)),
        closures: cl.map(serializeClosure),
        holidays: hol,
      },
    });
  } catch (e) {
    console.error('GET /leave/overview error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Leave entries ----
async function validateEntry(body: any, ctx: LeaveCtx, existing?: LeaveEntry): Promise<{ data?: Partial<LeaveEntry>; error?: string; status?: number }> {
  const user_id = body.user_id ?? existing?.user_id ?? ctx.id;
  const start_date = body.start_date ?? (existing && day(existing.start_date));
  const end_date = body.end_date ?? (existing && day(existing.end_date)) ?? start_date;
  const type = body.type ?? existing?.type ?? 'ferie';
  let period = body.period ?? existing?.period ?? 'full';
  const note = body.note !== undefined ? (String(body.note || '').trim().slice(0, 1000) || null) : existing?.note ?? null;

  if (user_id !== ctx.id && !ctx.admin) return { error: 'Puoi segnare solo le tue ferie', status: 403 };
  if (!isDate(start_date) || !isDate(end_date)) return { error: 'Date non valide' };
  if (end_date < start_date) return { error: 'La data di fine è prima di quella di inizio' };
  if (Date.parse(end_date) - Date.parse(start_date) > 366 * 86400000) return { error: 'Periodo troppo lungo (max 1 anno)' };
  if (!LEAVE_TYPES.includes(type)) return { error: 'Tipo non valido' };
  if (!PERIODS.includes(period)) return { error: 'Parte della giornata non valida' };
  if (start_date !== end_date) period = 'full';

  const target = await users().findOne({ where: { id: user_id } });
  if (!target || !target.leave_enabled) return { error: 'Collaboratore non presente nel calendario ferie' };

  // No overlapping periods for the same person (morning + afternoon of one day is fine)
  const qb = entries().createQueryBuilder('e')
    .where('e.user_id = :uid', { uid: user_id })
    .andWhere('e.start_date <= :end AND e.end_date >= :start', { start: start_date, end: end_date });
  if (existing) qb.andWhere('e.id != :id', { id: existing.id });
  const clash = (await qb.getMany()).filter(o => !(period !== 'full' && o.period !== 'full' && o.period !== period));
  if (clash.length) {
    const o = clash[0];
    return { error: `${target.name} ha già un'assenza dal ${day(o.start_date)} al ${day(o.end_date)}`, status: 409 };
  }
  return { data: { user_id, start_date, end_date, type, period, note } };
}

router.post('/entries', async (req: Request, res: Response) => {
  try {
    const v = await validateEntry(req.body || {}, req.leave!);
    if (v.error) return res.status(v.status || 400).json({ success: false, error: v.error });
    const saved = await entries().save(entries().create({ ...v.data, created_by: req.leave!.id }));
    const office = await holidays.officeHolidaySet(day(saved.start_date), day(saved.end_date));
    res.status(201).json({ success: true, data: serializeEntry(saved, office) });
  } catch (e) {
    console.error('POST /leave/entries error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.put('/entries/:id', async (req: Request, res: Response) => {
  try {
    const existing = await entries().findOne({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Assenza non trovata' });
    if (existing.user_id !== req.leave!.id && !req.leave!.admin) return res.status(403).json({ success: false, error: 'Puoi modificare solo le tue ferie' });
    const v = await validateEntry(req.body || {}, req.leave!, existing);
    if (v.error) return res.status(v.status || 400).json({ success: false, error: v.error });
    Object.assign(existing, v.data);
    const saved = await entries().save(existing);
    const office = await holidays.officeHolidaySet(day(saved.start_date), day(saved.end_date));
    res.json({ success: true, data: serializeEntry(saved, office) });
  } catch (e) {
    console.error('PUT /leave/entries error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    const existing = await entries().findOne({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Assenza non trovata' });
    if (existing.user_id !== req.leave!.id && !req.leave!.admin) return res.status(403).json({ success: false, error: 'Puoi eliminare solo le tue ferie' });
    await entries().remove(existing);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Company closures ----
async function validateClosure(body: any, existing?: CompanyClosure): Promise<{ data?: Partial<CompanyClosure>; error?: string }> {
  const company_id = body.company_id ?? existing?.company_id;
  const start_date = body.start_date ?? (existing && day(existing.start_date));
  const end_date = body.end_date ?? (existing && day(existing.end_date)) ?? start_date;
  let scopes: string[] = Array.isArray(body.scopes) ? body.scopes : existing?.scopes || ['totale'];
  const note = body.note !== undefined ? (String(body.note || '').trim().slice(0, 1000) || null) : existing?.note ?? null;

  if (!company_id || typeof company_id !== 'string') return { error: 'Scegli l\'azienda' };
  if (!(await AppDataSource.getRepository(Company).findOne({ where: { id: company_id } }))) return { error: 'Azienda non valida' };
  if (!isDate(start_date) || !isDate(end_date)) return { error: 'Date non valide' };
  if (end_date < start_date) return { error: 'La data di fine è prima di quella di inizio' };
  if (Date.parse(end_date) - Date.parse(start_date) > 366 * 86400000) return { error: 'Periodo troppo lungo (max 1 anno)' };
  scopes = [...new Set(scopes.map(String))].filter(s => CLOSURE_SCOPES.includes(s));
  if (!scopes.length) return { error: 'Indica cosa è chiuso' };
  if (scopes.includes('totale')) scopes = ['totale']; // "Totale" includes everything else
  return { data: { company_id, start_date, end_date, scopes, note } };
}

router.get('/closures', async (req: Request, res: Response) => {
  try {
    const qb = closures().createQueryBuilder('c').leftJoinAndSelect('c.company', 'company').where('1=1');
    const range = rangeFromQuery(req);
    if (range) qb.andWhere('c.start_date <= :to AND c.end_date >= :from', range);
    if (req.query.company_id) qb.andWhere('c.company_id = :cid', { cid: String(req.query.company_id) });
    const list = await qb.orderBy('c.start_date', 'ASC').getMany();
    res.json({ success: true, data: list.map(serializeClosure) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.post('/closures', async (req: Request, res: Response) => {
  try {
    const v = await validateClosure(req.body || {});
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const saved = await closures().save(closures().create({ ...v.data, created_by: req.leave!.id }));
    const full = await closures().findOne({ where: { id: saved.id }, relations: ['company'] });
    res.status(201).json({ success: true, data: serializeClosure(full!) });
  } catch (e) {
    console.error('POST /leave/closures error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.put('/closures/:id', async (req: Request, res: Response) => {
  try {
    const existing = await closures().findOne({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Chiusura non trovata' });
    if (existing.created_by !== req.leave!.id && !req.leave!.admin) return res.status(403).json({ success: false, error: 'Può modificarla solo chi l\'ha inserita o un responsabile' });
    const v = await validateClosure(req.body || {}, existing);
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    Object.assign(existing, v.data);
    await closures().save(existing);
    const full = await closures().findOne({ where: { id: existing.id }, relations: ['company'] });
    res.json({ success: true, data: serializeClosure(full!) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.delete('/closures/:id', async (req: Request, res: Response) => {
  try {
    const existing = await closures().findOne({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Chiusura non trovata' });
    if (existing.created_by !== req.leave!.id && !req.leave!.admin) return res.status(403).json({ success: false, error: 'Può eliminarla solo chi l\'ha inserita o un responsabile' });
    await closures().remove(existing);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Holidays ----
router.get('/holidays', async (req: Request, res: Response) => {
  try {
    const range = rangeFromQuery(req);
    if (!range) return res.status(400).json({ success: false, error: 'Periodo non valido' });
    const countries = req.query.countries ? String(req.query.countries).split(',') : undefined;
    res.json({ success: true, data: await holidays.getHolidays(range.from, range.to, countries) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.post('/holidays', adminOnly, async (req: Request, res: Response) => {
  try {
    const { country, date } = req.body || {};
    const name = String(req.body?.name || '').trim().slice(0, 200);
    if (!isValidCountry(country)) return res.status(400).json({ success: false, error: 'Paese non valido' });
    if (!isDate(date)) return res.status(400).json({ success: false, error: 'Data non valida' });
    if (!name) return res.status(400).json({ success: false, error: 'Indica il nome della festività' });
    const saved = await customHolidays().save(customHolidays().create({ country, date, name, created_by: req.leave!.id }));
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.delete('/holidays/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const h = await customHolidays().findOne({ where: { id: req.params.id } });
    if (!h) return res.status(404).json({ success: false, error: 'Festività non trovata' });
    await customHolidays().remove(h);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Personal iCal feed (Google Calendar) ----
router.get('/calendar-token', async (req: Request, res: Response) => {
  try {
    const u = await users().createQueryBuilder('u').addSelect('u.leave_ics_token').where('u.id = :id', { id: req.leave!.id }).getOne();
    let token = u?.leave_ics_token;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      await users().update({ id: req.leave!.id }, { leave_ics_token: token });
    }
    res.json({ success: true, data: { token } });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// A new link: the old one stops working (if it was shared by mistake)
router.post('/calendar-token/reset', async (req: Request, res: Response) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    await users().update({ id: req.leave!.id }, { leave_ics_token: token });
    res.json({ success: true, data: { token } });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ---- Settings: collaborators (leave admins) ----
router.get('/users', adminOnly, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await people(false) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.put('/users/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const target = await users().findOne({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    const { leave_enabled, leave_admin, leave_color, name } = req.body || {};
    if (leave_enabled !== undefined) target.leave_enabled = !!leave_enabled;
    if (leave_color !== undefined) {
      if (leave_color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(leave_color))) return res.status(400).json({ success: false, error: 'Colore non valido' });
      target.leave_color = leave_color;
    }
    if (leave_admin !== undefined) {
      // Only the master admin names the other leave managers
      if (req.leave!.role !== 'master_admin') return res.status(403).json({ success: false, error: 'Solo il master admin può nominare i responsabili ferie' });
      if (target.role !== 'master_admin') target.leave_admin = !!leave_admin;
    }
    // Names can be changed here only for accounts made by this module
    if (name !== undefined && target.leave_only && String(name).trim()) target.name = String(name).trim().slice(0, 200);
    await users().save(target);
    res.json({ success: true, data: (await people(false)).find(p => p.id === target.id) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// New collaborator without a TradeFlow account: it can use only the Ferie section
router.post('/users', adminOnly, async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 200);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!name) return res.status(400).json({ success: false, error: 'Indica il nome' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Email non valida' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'La password deve avere almeno 8 caratteri' });
    if (await users().findOne({ where: { email } })) return res.status(409).json({ success: false, error: 'Esiste già un utente con questa email: attivalo dalla lista' });
    const saved = await users().save(users().create({
      name, email,
      password_hash: await bcrypt.hash(password, 10),
      role: 'sales_rep',
      leave_enabled: true,
      leave_only: true,
    } as Partial<User>));
    res.status(201).json({ success: true, data: (await people(false)).find(p => p.id === saved.id) });
  } catch (e) {
    console.error('POST /leave/users error:', (e as Error).message);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// Password of a Ferie-only account (full TradeFlow accounts: Users Settings)
router.patch('/users/:id/password', adminOnly, async (req: Request, res: Response) => {
  try {
    const target = await users().findOne({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    if (!target.leave_only) return res.status(403).json({ success: false, error: 'Per gli utenti TradeFlow usa Users Settings' });
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ success: false, error: 'La password deve avere almeno 8 caratteri' });
    target.password_hash = await bcrypt.hash(password, 10);
    await users().save(target);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
