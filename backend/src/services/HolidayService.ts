import Holidays from 'date-holidays';
import { AppDataSource } from '../config/database';
import { CustomHoliday } from '../entities/CustomHoliday';

export interface HolidayItem {
  date: string;      // YYYY-MM-DD
  country: string;   // ISO code
  name: string;
  source: 'calendar' | 'custom';
  id?: string;       // custom holidays only
}

// Italy first (the office), then the countries Primula works with
export const LEAVE_COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
  { code: 'CN', name: 'Cina', flag: '🇨🇳' },
  { code: 'KR', name: 'Corea del Sud', flag: '🇰🇷' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'JP', name: 'Giappone', flag: '🇯🇵' },
  { code: 'PH', name: 'Filippine', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'KH', name: 'Cambogia', flag: '🇰🇭' },
  { code: 'TH', name: 'Thailandia', flag: '🇹🇭' },
  { code: 'MY', name: 'Malesia', flag: '🇲🇾' },
];
const COUNTRY_CODES = new Set(LEAVE_COUNTRIES.map(c => c.code));

// Sassuolo's patron saint: a holiday for the office
const PATRON = { md: '04-23', name: 'San Giorgio (Patrono di Sassuolo)' };

// Cambodia is not in the holiday library. Fixed-date holidays every year;
// lunar ones from the government sub-decrees (later years: add them by hand).
const KH_FIXED: [string, string][] = [
  ['01-01', 'New Year\'s Day'],
  ['01-07', 'Victory over Genocide Day'],
  ['03-08', 'International Women\'s Day'],
  ['04-14', 'Khmer New Year'],
  ['04-15', 'Khmer New Year'],
  ['04-16', 'Khmer New Year'],
  ['05-01', 'International Labour Day'],
  ['05-14', 'King Norodom Sihamoni\'s Birthday'],
  ['06-18', 'Queen Mother\'s Birthday'],
  ['09-24', 'Constitution Day'],
  ['10-15', 'Commemoration Day of King Father Norodom Sihanouk'],
  ['10-29', 'King\'s Coronation Day'],
  ['11-09', 'Independence Day'],
];
const KH_LUNAR: Record<number, [string, string][]> = {
  2025: [
    ['2025-05-11', 'Visak Bochea'], ['2025-05-15', 'Royal Ploughing Ceremony'],
    ['2025-09-21', 'Pchum Ben'], ['2025-09-22', 'Pchum Ben'], ['2025-09-23', 'Pchum Ben'],
    ['2025-11-04', 'Water Festival (Bon Om Touk)'], ['2025-11-05', 'Water Festival (Bon Om Touk)'], ['2025-11-06', 'Water Festival (Bon Om Touk)'],
  ],
  2026: [
    ['2026-05-01', 'Visak Bochea'], ['2026-05-05', 'Royal Ploughing Ceremony'],
    ['2026-10-10', 'Pchum Ben'], ['2026-10-11', 'Pchum Ben'], ['2026-10-12', 'Pchum Ben'],
    ['2026-11-23', 'Water Festival (Bon Om Touk)'], ['2026-11-24', 'Water Festival (Bon Om Touk)'], ['2026-11-25', 'Water Festival (Bon Om Touk)'],
  ],
};

const yearCache = new Map<string, HolidayItem[]>();

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function calendarHolidays(country: string, year: number): HolidayItem[] {
  const key = `${country}-${year}`;
  const cached = yearCache.get(key);
  if (cached) return cached;

  let list: HolidayItem[] = [];
  if (country === 'KH') {
    list = KH_FIXED.map(([md, name]) => ({ date: `${year}-${md}`, country, name, source: 'calendar' as const }));
    for (const [date, name] of KH_LUNAR[year] || []) list.push({ date, country, name, source: 'calendar' });
  } else {
    const hd = new Holidays(country, { languages: country === 'IT' ? ['it'] : ['en'], types: ['public'] } as any);
    const raw = (hd.getHolidays(year) || []) as any[];
    for (const h of raw) {
      // A holiday can span several days (start/end): list each day
      const first = String(h.date).slice(0, 10);
      const days = Math.max(1, Math.round((new Date(h.end).getTime() - new Date(h.start).getTime()) / 86400000));
      for (let i = 0; i < days; i++) list.push({ date: addDays(first, i), country, name: h.name, source: 'calendar' });
    }
    if (country === 'IT') list.push({ date: `${year}-${PATRON.md}`, country, name: PATRON.name, source: 'calendar' });
  }

  // One entry per day and name (the library has some duplicates)
  const seen = new Set<string>();
  list = list
    .filter(h => {
      const k = `${h.date}|${h.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  yearCache.set(key, list);
  return list;
}

export function isValidCountry(code: string) {
  return COUNTRY_CODES.has(code);
}

export class HolidayService {
  private repo = () => AppDataSource.getRepository(CustomHoliday);

  async getHolidays(from: string, to: string, countries?: string[]): Promise<HolidayItem[]> {
    const wanted = (countries && countries.length ? countries : [...COUNTRY_CODES]).filter(c => COUNTRY_CODES.has(c));
    const y1 = Number(from.slice(0, 4));
    const y2 = Number(to.slice(0, 4));
    const out: HolidayItem[] = [];
    for (let y = y1; y <= y2; y++) {
      for (const c of wanted) {
        for (const h of calendarHolidays(c, y)) if (h.date >= from && h.date <= to) out.push(h);
      }
    }
    const custom = await this.repo()
      .createQueryBuilder('h')
      .where('h.date BETWEEN :from AND :to', { from, to })
      .getMany();
    for (const h of custom) {
      if (wanted.includes(h.country)) {
        out.push({ id: h.id, date: String(h.date).slice(0, 10), country: h.country, name: h.name, source: 'custom' });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
  }

  /** Italian (office) holidays as a set of dates, for counting working days */
  async officeHolidaySet(from: string, to: string): Promise<Set<string>> {
    const list = await this.getHolidays(from, to, ['IT']);
    return new Set(list.map(h => h.date));
  }
}

/** Working days in a period (weekends and office holidays excluded) */
export function countWorkingDays(start: string, end: string, period: string, officeHolidays: Set<string>): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6 || officeHolidays.has(d)) continue;
    n++;
  }
  return period !== 'full' && start === end ? n * 0.5 : n;
}
