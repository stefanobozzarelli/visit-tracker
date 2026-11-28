// Shared helpers of the Ferie (leave planner) module

export interface LeavePerson { id: string; name: string; email: string; color: string; leave_enabled: boolean; leave_admin: boolean; leave_only: boolean; role: string }
export interface LeaveEntry { id: string; user_id: string; start_date: string; end_date: string; type: string; period: 'full' | 'am' | 'pm'; note: string | null; created_by: string | null; working_days: number }
export interface Closure { id: string; company_id: string; company_name: string; company_country: string; start_date: string; end_date: string; scopes: string[]; note: string | null; created_by: string | null }
export interface Holiday { date: string; country: string; name: string; source: 'calendar' | 'custom'; id?: string }
export interface Country { code: string; name: string; flag: string }
export interface LeaveMe { id: string; name: string; enabled: boolean; admin: boolean; master: boolean }
export interface LeaveCompany { id: string; name: string; country: string }

export const LEAVE_TYPES: Record<string, { label: string; color: string; soft: string; text: string }> = {
  ferie:     { label: 'Ferie',     color: '#4A7FA8', soft: '#DCE8F2', text: '#24506F' },
  permesso:  { label: 'Permesso',  color: '#C9932E', soft: '#F6EAD2', text: '#7A5410' },
  malattia:  { label: 'Malattia',  color: '#B5544B', soft: '#F3DEDB', text: '#7C2C25' },
  trasferta: { label: 'Trasferta', color: '#7D5FA3', soft: '#E8E0F1', text: '#4D3570' },
  altro:     { label: 'Altro',     color: '#7A7570', soft: '#E7E4E0', text: '#4A4642' },
};

export const PERIOD_LABELS: Record<string, string> = { full: 'Giornata intera', am: 'Mattina', pm: 'Pomeriggio' };

export const SCOPES: Record<string, { label: string; short: string; color: string }> = {
  totale:     { label: 'Chiusura totale', short: 'TOT', color: '#9E3F38' },
  uffici:     { label: 'Uffici',          short: 'UFF', color: '#4A6078' },
  produzione: { label: 'Produzione',      short: 'PRO', color: '#B07040' },
  spedizioni: { label: 'Spedizioni',      short: 'SPE', color: '#5B8A65' },
  campioni:   { label: 'Campioni',        short: 'CAM', color: '#8A5B86' },
};

export const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
export const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const todayStr = () => {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
};
export const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
export const weekday = (date: string) => new Date(date + 'T12:00:00').getDay();
export const isWeekend = (date: string) => { const w = weekday(date); return w === 0 || w === 6; };

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return new Date(date + 'T12:00:00').toLocaleDateString('it-IT', opts);
}

export function fmtRange(start: string, end: string) {
  if (start === end) return fmtDate(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const a = fmtDate(start, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const b = fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} → ${b}`;
}

export function workingDays(start: string, end: string, period: string, officeHolidays: Set<string>) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d) || officeHolidays.has(d)) continue;
    n++;
  }
  return period !== 'full' && start === end ? n * 0.5 : n;
}

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function errorMessage(e: any, fallback = 'Operazione non riuscita') {
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}

/** Entries / closures overlapping a period */
export const overlaps = (s: string, e: string, from: string, to: string) => s <= to && e >= from;
