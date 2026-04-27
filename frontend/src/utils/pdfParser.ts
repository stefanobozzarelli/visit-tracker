import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export interface ParsedFlight {
  date: string | null;
  route: string;
  details: string;
  rawText: string;
}

export interface ParsedHotel {
  name: string;
  checkIn: string | null;
  checkOut: string | null;
  rawText: string;
}

export interface PdfParseResult {
  type: 'flight' | 'hotel' | 'mixed' | 'unknown';
  flights: ParsedFlight[];
  hotels: ParsedHotel[];
  rawText: string;
}

// Month name to number mapping (IT + EN, short + long)
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  gen: '01', mag: '05', giu: '06', lug: '07', ago: '08', set: '09', ott: '10', dic: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
  luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

async function extractText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Preserve some line structure by checking Y positions
    let lastY = -1;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as any[]) {
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 3) {
        lines.push(line.trim());
        line = '';
      }
      line += (line ? ' ' : '') + item.str;
      lastY = item.transform[5];
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join('\n'));
  }
  // Normalize unicode ratio colon ∶ (U+2236, used by Trip.com) to regular colon
  return pages.join('\n\n').replace(/∶/g, ':');
}

function parseDate(text: string): string | null {
  // YYYY-MM-DD
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD MONTH YYYY (any language)
  const re = new RegExp(`(\\d{1,2})\\s+(${MONTH_NAMES})\\s+(\\d{4})`, 'i');
  m = text.match(re);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }

  return null;
}

function findAllDates(text: string): string[] {
  const dates: string[] = [];

  // YYYY-MM-DD
  for (const m of text.matchAll(/\d{4}-\d{2}-\d{2}/g)) {
    const d = parseDate(m[0]); if (d) dates.push(d);
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  for (const m of text.matchAll(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/g)) {
    const d = parseDate(m[0]); if (d) dates.push(d);
  }
  // DD MONTH YYYY
  const re = new RegExp(`\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}`, 'gi');
  for (const m of text.matchAll(re)) {
    const d = parseDate(m[0]); if (d) dates.push(d);
  }
  return [...new Set(dates)].sort();
}

// Common 3-letter IATA airport codes (to filter noise)
const IATA_CODES = new Set([
  'FCO', 'MXP', 'LIN', 'BLQ', 'VCE', 'NAP', 'PSA', 'FLR', 'TRN', 'BGY', 'CTA', 'PMO', 'BRI', 'CAG', 'OLB',
  'LHR', 'LGW', 'STN', 'CDG', 'ORY', 'FRA', 'MUC', 'AMS', 'BRU', 'MAD', 'BCN', 'LIS', 'ZRH', 'VIE', 'WAW',
  'IST', 'SAW', 'ATH', 'DUB', 'HEL', 'CPH', 'ARN', 'OSL',
  'JFK', 'LAX', 'ORD', 'SFO', 'MIA', 'ATL', 'DFW', 'EWR', 'IAD', 'BOS', 'SEA',
  'PEK', 'PKX', 'PVG', 'SHA', 'CAN', 'SZX', 'CTU', 'HGH', 'NKG', 'WUH', 'XIY', 'KMG', 'CSX', 'TAO', 'DLC', 'TSN', 'SHE', 'CGO', 'FOC',
  'TPE', 'KHH', 'TSA', 'RMQ',
  'NRT', 'HND', 'KIX', 'NGO', 'FUK', 'CTS',
  'ICN', 'GMP', 'PUS',
  'HKG', 'SIN', 'BKK', 'DMK', 'KUL', 'CGK', 'MNL', 'SGN', 'HAN', 'DEL', 'BOM', 'DXB', 'DOH', 'AUH',
  'SYD', 'MEL', 'AKL',
  'GRU', 'MEX', 'BOG', 'EZE', 'SCL', 'LIM',
  'JNB', 'CAI', 'CMN', 'NBO', 'ADD',
]);

// Find "DD MONTH" without year and combine with a known year
function parseDateWithFallbackYear(text: string, fallbackYear: string): string | null {
  const full = parseDate(text);
  if (full) return full;

  // Try DD MONTH (without year) - look for short month names first
  const re = new RegExp(`(\\d{1,2})\\s+(${MONTH_NAMES})(?!\\s*\\d{4})`, 'i');
  const m = text.match(re);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return `${fallbackYear}-${month}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseFlightSegments(text: string): ParsedFlight[] {
  const flights: ParsedFlight[] = [];
  const upperText = text.toUpperCase();

  // Extract year from document (look for any full date with year)
  const allFullDates = findAllDates(text);
  const fallbackYear = allFullDates.length > 0 ? allFullDates[0].substring(0, 4) : new Date().getFullYear().toString();

  // Known airline prefixes (extensive list)
  const airlinePrefixes = new Set([
    'TK', 'MU', 'CA', 'CX', 'BR', 'SQ', 'QF', 'EK', 'QR', 'LH', 'AF', 'BA', 'KL',
    'AZ', 'IB', 'FR', 'U2', 'W6', 'TR', 'FM', 'HU', 'OZ', 'KE', 'NH', 'JL', 'CZ',
    'HX', 'UO', 'AI', 'ET', 'TG', 'VN', 'GA', 'MH', 'PR', 'CI', 'EY', 'WY', 'SV',
    'DL', 'AA', 'UA', 'AC', 'LX', 'OS', 'SK', 'FI', 'AY', 'LO', 'RO', 'SU', 'S7',
    'PC', 'QS', 'VY', 'BT', 'TP', 'SN', 'A3', 'MS', 'RJ', 'ME', 'GF', 'WB',
    'ZH', 'SC', 'MF', 'GS', 'PN', '3U', 'EU', 'GJ', 'NS', 'TV', 'DR', 'GX',  // Chinese airlines
    'TW', 'JX', 'KA', 'LD', 'NX', 'HB', 'FD', 'AK', 'QZ', 'XT', 'XJ', 'DD',  // Asian LCCs
    'LY', 'UP', 'IZ', 'J2', '5W', 'PG', 'WE', 'SL', 'OD', 'VZ', '8M',        // More Asian
    'EI', 'BE', 'LS', 'MT', 'BY', 'TOM', 'ZB', 'DY', 'D8', 'HV', 'XR',        // European
  ]);

  // Find ALL flight codes in the entire text with their positions
  const allCodes: { code: string; pos: number }[] = [];
  for (const m of upperText.matchAll(/\b([A-Z]{2})\s?(\d{3,4})\b/g)) {
    if (airlinePrefixes.has(m[1])) {
      allCodes.push({ code: `${m[1]}${m[2]}`, pos: m.index || 0 });
    }
  }

  // For each flight code, extract a context window and parse details
  for (let i = 0; i < allCodes.length; i++) {
    const { code, pos } = allCodes[i];
    // Context: from 200 chars before this code to either next code or 600 chars after
    const contextStart = Math.max(0, pos - 200);
    const contextEnd = i < allCodes.length - 1
      ? Math.min(allCodes[i + 1].pos, pos + 600)
      : Math.min(text.length, pos + 600);
    const context = text.substring(contextStart, contextEnd);
    const contextUpper = context.toUpperCase();

    // Find IATA airport codes in this context
    const airports = [...contextUpper.matchAll(/\b([A-Z]{3})\b/g)]
      .map(m => m[1])
      .filter(c => IATA_CODES.has(c));
    // Deduplicate consecutive same codes
    const uniqueAirports: string[] = [];
    for (const a of airports) {
      if (uniqueAirports[uniqueAirports.length - 1] !== a) uniqueAirports.push(a);
    }
    const route = uniqueAirports.length >= 2 ? `${uniqueAirports[0]}-${uniqueAirports[1]}` : uniqueAirports[0] || '';

    // Find departure and arrival times (labeled format)
    const depTimeMatch = context.match(/[Pp]artenza\s+alle\s*:?\s*(\d{1,2}:\d{2})/) ||
                         context.match(/[Dd]eparture[:\s]+(\d{1,2}:\d{2})/);
    const arrTimeMatch = context.match(/[Aa]rrivo\s+alle\s*:?\s*(\d{1,2}:\d{2})/) ||
                         context.match(/[Aa]rrival[:\s]+(\d{1,2}:\d{2})/);
    let depTime = depTimeMatch?.[1] || '';
    let arrTime = arrTimeMatch?.[1] || '';

    // Fallback: extract times from lines like "HH:MM CITY (IATA)" or "HH:MM IATA ..."
    // Handles Turkish Airlines and Trip.com formats without labeled Partenza/Arrivo
    if (!depTime || !arrTime) {
      const pairedTimes: { time: string; iata?: string }[] = [];
      for (const cline of context.split('\n')) {
        const trimmed = cline.trim();
        // Turkish Airlines: "10:30 BOLOGNA Aeroporto Guglielmo Marconi (BLQ)"
        const m1 = trimmed.match(/^(\d{2}:\d{2})\s+.*\(([A-Z]{3})\)/);
        // Trip.com: "12:25 CAN Guangzhou Baiyun"
        const m2 = !m1 ? trimmed.match(/^(\d{2}:\d{2})\s+([A-Z]{3})\b/) : null;
        const tm = m1 || m2;
        if (tm && tm[2] && IATA_CODES.has(tm[2])) {
          pairedTimes.push({ time: tm[1], iata: tm[2] });
        } else if (!tm) {
          // Bare HH:MM at start of line (last resort)
          const m3 = trimmed.match(/^(\d{2}:\d{2})\b/);
          if (m3) pairedTimes.push({ time: m3[1] });
        }
      }
      if (!depTime && pairedTimes.length >= 1) depTime = pairedTimes[0].time;
      if (!arrTime && pairedTimes.length >= 2) arrTime = pairedTimes[pairedTimes.length - 1].time;
      // Absolute last resort: any HH:MM in context
      if (!depTime) {
        const allTimes = [...context.matchAll(/\b(\d{2}:\d{2})\b/g)].map(m => m[1]);
        if (allTimes.length >= 1) depTime = allTimes[0];
        if (!arrTime && allTimes.length >= 2) arrTime = allTimes[allTimes.length - 1];
      }
    }

    const timeStr = depTime && arrTime ? `${depTime}/${arrTime}` : depTime || '';

    // Find date in context - try full date first, then DD MONTH with fallback year
    const dateFromContext = parseDateWithFallbackYear(context, fallbackYear);

    flights.push({
      date: dateFromContext,
      route,
      details: `${code}${timeStr ? ' ' + timeStr : ''}`,
      rawText: context.substring(0, 400),
    });
  }

  // Strategy 2: Trip.com / structured format with "Partenza:" / "Arrivo:" / "Compagnia aerea:"
  {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/compagnia\s+aerea|airline/i.test(line)) continue;
      // Wide search: 25 lines back, 5 forward (Partenza/Arrivo are above Compagnia aerea)
      const block = lines.slice(Math.max(0, i - 25), i + 5).join('\n');
      const codeMatch = line.match(/\b([A-Z]{2})\s?(\d{3,4})\b/) || block.match(/\b([A-Z]{2})\s?(\d{3,4})\b/);
      if (!codeMatch) continue;
      const code = `${codeMatch[1]}${codeMatch[2]}`;

      // Partenza/Arrivo with date and time (may be on same or different lines)
      // "Partenza 10 marzo 2026, 18:25" or "Partenza\n10 marzo 2026, 18:25"
      const partenzaMatch = block.match(/[Pp]artenza\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/)
        || block.match(/[Pp]artenza[\s\n:]+(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/);
      const arrivoMatch = block.match(/[Aa]rrivo\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/)
        || block.match(/[Aa]rrivo[\s\n:]+(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/);
      const depDate = partenzaMatch ? parseDate(partenzaMatch[1]) : parseDateWithFallbackYear(block, fallbackYear);
      const depTime = partenzaMatch?.[2] || '';
      const arrTime = arrivoMatch?.[2] || '';
      const timeStr = depTime && arrTime ? `${depTime}/${arrTime}` : depTime || '';

      // Route: "City – City" or "City - City" (various dash types, case-insensitive)
      const routeMatch = block.match(/([A-Za-z][A-Za-z\s]{2,20}?)\s*[–\-—]\s*([A-Za-z][A-Za-z\s]{2,20}?)(?:\n|$)/m);
      const route = routeMatch ? `${routeMatch[1].trim()}-${routeMatch[2].trim()}` : '';

      flights.push({
        date: depDate,
        route,
        details: `${code}${timeStr ? ' ' + timeStr : ''}`,
        rawText: block.substring(0, 400),
      });
    }
  }

  // Strategy 3: Generic - look for "Informazioni sul volo" sections (Trip.com IT)
  {
    const infoMatch = text.match(/[Ii]nformazioni\s+sul\s+volo/);
    if (infoMatch) {
      const startPos = infoMatch.index || 0;
      const section = text.substring(startPos, startPos + 1000);
      // Find flight code anywhere in section
      const codeMatch = section.match(/\b([A-Z]{2})\s?(\d{3,4})\b/);
      if (codeMatch) {
        const code = `${codeMatch[1]}${codeMatch[2]}`;
        const partenzaMatch = section.match(/[Pp]artenza\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/);
        const arrivoMatch = section.match(/[Aa]rrivo\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})[,\s]+(\d{1,2}:\d{2})/);
        const depDate = partenzaMatch ? parseDate(partenzaMatch[1]) : null;
        const depTime = partenzaMatch?.[2] || '';
        const arrTime = arrivoMatch?.[2] || '';
        const timeStr = depTime && arrTime ? `${depTime}/${arrTime}` : depTime || '';
        const routeMatch = section.match(/([A-Za-z][A-Za-z\s]{2,20}?)\s*[–\-—]\s*([A-Za-z][A-Za-z\s]{2,20}?)(?:\n|$)/m);
        const route = routeMatch ? `${routeMatch[1].trim()}-${routeMatch[2].trim()}` : '';
        flights.push({ date: depDate, route, details: `${code}${timeStr ? ' ' + timeStr : ''}`, rawText: section.substring(0, 400) });
      }
    }
  }

  // Deduplicate: keep only the best match per flight code (prefer ones with route and date)
  const seen = new Map<string, ParsedFlight>();
  for (const f of flights) {
    const existing = seen.get(f.details.split(' ')[0]); // key by flight code only
    if (!existing) {
      seen.set(f.details.split(' ')[0], f);
    } else {
      // Prefer entry with route + date + times
      const score = (fl: ParsedFlight) => (fl.route ? 2 : 0) + (fl.date ? 2 : 0) + (fl.details.includes('/') ? 1 : 0);
      if (score(f) > score(existing)) {
        seen.set(f.details.split(' ')[0], f);
      }
    }
  }

  return [...seen.values()];
}

function parseHotelBooking(text: string): ParsedHotel[] {
  const hotels: ParsedHotel[] = [];
  const dates = findAllDates(text);
  const lower = text.toLowerCase();

  const hotelBrands = [
    'hotel', 'inn', 'resort', 'suites', 'marriott', 'hilton', 'hyatt', 'sheraton',
    'mercure', 'novotel', 'ibis', 'accor', 'intercontinental', 'holiday inn',
    'courtyard', 'fairfield', 'westin', 'radisson', 'best western', 'ramada',
    'crowne plaza', 'dormy', 'emperor', 'riviera', 'samjung', 'kunlun', 'summit',
    'hostel', 'b&b', 'motel', 'lodge', 'residence', 'palazzo', 'albergo',
  ];

  let hotelName = '';
  let checkInDate: string | null = null;
  let checkOutDate: string | null = null;

  // Strategy 1: Check-in/out dates - handle both same-line and multi-line formats
  // Same line: "Check-in: 21/03/2026" or "Check-in: 21 mar 2026"
  const datePattern = `\\d{1,2}[\/\\-\\.]\\d{1,2}[\/\\-\\.]\\d{4}|\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}`;
  const checkinSameLine = text.match(new RegExp(`check[\\s-]*in[:\\s]+(${datePattern})`, 'i'));
  const checkoutSameLine = text.match(new RegExp(`check[\\s-]*out[:\\s]+(${datePattern})`, 'i'));

  if (checkinSameLine) {
    checkInDate = parseDate(checkinSameLine[1]);
  }
  if (checkoutSameLine) {
    checkOutDate = parseDate(checkoutSameLine[1]);
  }

  // Multi-line: "Check-in\n21 mar 2026" (Trip.com, Booking.com format)
  if (!checkInDate || !checkOutDate) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim().toLowerCase();
      if (!checkInDate && /^check[\s-]*in/.test(line)) {
        // Look at next 3 lines for a date
        for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
          const d = parseDate(lines[j]);
          if (d) { checkInDate = d; break; }
        }
      }
      if (!checkOutDate && /^check[\s-]*out/.test(line)) {
        for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
          const d = parseDate(lines[j]);
          if (d) { checkOutDate = d; break; }
        }
      }
    }
  }

  // Fallback: use first two dates from document
  if (!checkInDate && dates.length > 0) checkInDate = dates[0];
  if (!checkOutDate && dates.length > 1) checkOutDate = dates[1];

  // Strategy 2: Find hotel brand name in text
  for (const brand of hotelBrands) {
    const idx = lower.indexOf(brand);
    if (idx === -1) continue;
    // Get the line containing the brand
    const start = Math.max(0, lower.lastIndexOf('\n', idx));
    const end = lower.indexOf('\n', idx + brand.length);
    const line = text.substring(start, end === -1 ? start + 120 : end).trim();
    // Filter out lines that are just labels like "hotel" or "Ora locale dell'hotel"
    if (line.length > 5 && line.length < 120 && !/ora locale|hotel\s*name|check/i.test(line)) {
      hotelName = line;
      break;
    }
  }

  // Strategy 3: Look for "Property:", "Struttura:", "Accommodation:" labels
  if (!hotelName) {
    const propMatch = text.match(/(?:property|accommodation|struttura|alloggio|nome\s+hotel|hotel\s*name)[:\s]+([^\n]{3,80})/i);
    if (propMatch) hotelName = propMatch[1].trim();
  }

  // Strategy 4: Look for "Dati per il check-in" pattern (Trip.com) - hotel name is usually nearby
  if (!hotelName) {
    const tripcomMatch = text.match(/(?:dati per il check-in|check-in data|booking confirmation)[\s\S]{0,200}?(?:hotel|inn|resort|suites|dormy|mercure|courtyard|fairfield|samjung|emperor|riviera|kunlun|summit)\s+[^\n]{3,60}/i);
    if (tripcomMatch) {
      const nameMatch = tripcomMatch[0].match(/((?:hotel|inn|resort|suites|dormy|mercure|courtyard|fairfield|samjung|emperor|riviera|kunlun|summit)\s+[^\n]{3,60})/i);
      if (nameMatch) hotelName = nameMatch[1].trim();
    }
  }

  // Only add hotel if we found a hotel name
  if (hotelName) {
    hotels.push({
      name: hotelName,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      rawText: text.substring(0, 500),
    });
  }

  return hotels;
}

function detectType(text: string): 'flight' | 'hotel' | 'mixed' | 'unknown' {
  const lower = text.toLowerCase();

  const flightKeywords = [
    'flight', 'volo', 'boarding', 'departure', 'arrival', 'partenza', 'arrivo',
    'gate', 'terminal', 'airline', 'compagnia aerea', 'passenger', 'passeggero',
    'e-ticket', 'itinerary', 'booking reference', 'codice di prenotazione',
    'prenotazione di viaggio', 'bagaglio', 'baggage', 'check-in obbligatorio',
    'biglietto elettronico', 'airline reservation', 'miglia', 'durata',
    'cabina', 'cabin', 'aeromobile', 'aircraft', 'boeing', 'airbus',
  ];
  const hotelKeywords = [
    'hotel', 'check-in', 'check-out', 'check in', 'check out', 'room', 'camera',
    'accommodation', 'alloggio', 'struttura', 'nights', 'notti', 'reservation',
    'guest', 'ospite', 'soggiorno', 'pernottamento',
  ];

  let flightScore = flightKeywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
  let hotelScore = hotelKeywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);

  // Boost for flight codes
  const airlinePrefixes = ['TK', 'MU', 'CA', 'CX', 'BR', 'SQ', 'EK', 'QR', 'LH', 'AF', 'BA', 'AZ', 'FR', 'TR', 'FM'];
  for (const prefix of airlinePrefixes) {
    const re = new RegExp(`\\b${prefix}\\s?\\d{3,4}\\b`);
    if (re.test(text)) flightScore += 3;
  }

  // Boost for IATA codes
  const iataInText = [...text.matchAll(/\b[A-Z]{3}\b/g)].filter(m => IATA_CODES.has(m[0]));
  if (iataInText.length >= 2) flightScore += 2;

  if (flightScore > 0 && hotelScore > 0) return 'mixed';
  if (flightScore >= 2) return 'flight';
  if (hotelScore >= 2) return 'hotel';
  if (flightScore > 0) return 'flight';
  if (hotelScore > 0) return 'hotel';
  return 'unknown';
}

export async function parsePdf(file: File): Promise<PdfParseResult> {
  const rawText = await extractText(file);
  const type = detectType(rawText);

  // Always try to parse both - the PDF might contain mixed content
  const flights = parseFlightSegments(rawText);
  const hotels = parseHotelBooking(rawText);

  // Refine type based on actual parsing results
  const finalType = flights.length > 0 && hotels.length > 0 ? 'mixed'
    : flights.length > 0 ? 'flight'
    : hotels.length > 0 ? 'hotel'
    : type;

  return { type: finalType, flights, hotels, rawText };
}
