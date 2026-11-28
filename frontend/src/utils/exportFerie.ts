import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LeaveEntry, LeavePerson, Closure, Holiday, Country,
  LEAVE_TYPES, SCOPES, MONTHS, WEEKDAYS, WEEKDAYS_SHORT, PERIOD_LABELS,
  daysInMonth, ymd, isWeekend, weekday, fmtDate,
} from './ferie';
import { downloadBlob } from './downloadBlob';

// Used by pages/Ferie.tsx ("Esporta"): the leave plan of a period as Excel or PDF.
export interface FerieExportData {
  from: string;
  to: string;
  label: string;          // e.g. "Dicembre 2026" or "Anno 2026"
  people: LeavePerson[];
  entries: LeaveEntry[];
  closures: Closure[];
  holidays: Holiday[];
  countries: Country[];
}

const SHORT: Record<string, string> = { ferie: 'F', permesso: 'P', malattia: 'M', trasferta: 'T', altro: 'A' };

function months(from: string, to: string) {
  const out: { y: number; m: number }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7)) - 1;
  const endKey = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - 1;
  while (y * 12 + m <= endKey) {
    out.push({ y, m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

function cellEntries(entries: LeaveEntry[], userId: string, d: string) {
  return entries.filter(e => e.user_id === userId && e.start_date <= d && e.end_date >= d);
}

const asDate = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const fileBase = (label: string) => `Ferie_Primula_${label.replace(/\s+/g, '_')}`;
// The PDF core fonts have no glyphs for some characters
const pdfText = (s: string) => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/→/g, '-').replace(/[–—]/g, '-').replace(/[^\x00-\xFF]/g, '');

function inRange<T extends { start_date: string; end_date: string }>(list: T[], from: string, to: string) {
  return list.filter(x => x.start_date <= to && x.end_date >= from);
}

// ============================== Excel ==============================
export function exportFerieExcel(data: FerieExportData) {
  const { from, to, people, countries } = data;
  const entries = inRange(data.entries, from, to);
  const closures = inRange(data.closures, from, to);
  const holidays = data.holidays.filter(h => h.date >= from && h.date <= to);
  const cname = new Map(countries.map(c => [c.code, c.name]));
  const pname = new Map(people.map(p => [p.id, p.name]));
  const itHol = new Map<string, string>();
  holidays.filter(h => h.country === 'IT').forEach(h => itHol.set(h.date, h.name));
  const wb = XLSX.utils.book_new();

  // One planner sheet per month
  for (const { y, m } of months(from, to)) {
    const n = daysInMonth(y, m);
    const days = Array.from({ length: n }, (_, i) => ymd(y, m, i + 1));
    const aoa: any[][] = [];
    aoa.push([`Ferie Primula — ${MONTHS[m]} ${y}`]);
    aoa.push(['Collaboratore', ...days.map(d => Number(d.slice(8))), 'Giorni lav.']);
    aoa.push(['', ...days.map(d => WEEKDAYS_SHORT[weekday(d)]), '']);
    aoa.push(['Festività Italia', ...days.map(d => (itHol.has(d) ? 'FEST' : isWeekend(d) ? '·' : '')), '']);
    aoa.push(['Festività Asia', ...days.map(d => [...new Set(holidays.filter(h => h.date === d && h.country !== 'IT').map(h => h.country))].join(' ')), '']);
    for (const p of people) {
      let tot = 0;
      const row: any[] = [p.name];
      for (const d of days) {
        const list = cellEntries(entries, p.id, d);
        if (!list.length) { row.push(isWeekend(d) || itHol.has(d) ? '·' : ''); continue; }
        const off = isWeekend(d) || itHol.has(d);
        if (!off) tot += list.some(e => e.period === 'full') ? 1 : 0.5 * list.length;
        row.push(list.map(e => (e.period === 'full' ? '' : '½') + (SHORT[e.type] || 'A')).join('+'));
      }
      row.push(Math.min(tot, n));
      aoa.push(row);
    }
    const monthClosures = inRange(closures, days[0], days[n - 1]);
    if (monthClosures.length) {
      aoa.push([]);
      aoa.push(['Chiusure aziende']);
      for (const c of monthClosures) {
        aoa.push([c.company_name, ...days.map(d => (c.start_date <= d && c.end_date >= d ? c.scopes.map(s => SCOPES[s]?.short || s).join('/') : '')), '']);
      }
    }
    aoa.push([]);
    aoa.push(['Legenda: F = Ferie · P = Permesso · M = Malattia · T = Trasferta · A = Altro · ½ = mezza giornata · FEST = festivo · TOT/UFF/PRO/SPE/CAM = chiusura totale / uffici / produzione / spedizioni / campioni']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }, ...days.map(() => ({ wch: 4.2 })), { wch: 10 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: n } }];
    ws['!freeze'] = { xSplit: 1, ySplit: 3 } as any;
    XLSX.utils.book_append_sheet(wb, ws, `${MONTHS[m].slice(0, 3)} ${y}`);
  }

  // Absences
  const rows = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date) || (pname.get(a.user_id) || '').localeCompare(pname.get(b.user_id) || ''));
  const absAoa: any[][] = [['Collaboratore', 'Tipo', 'Dal', 'Al', 'Durata', 'Giorni lavorativi', 'Note']];
  for (const e of rows) {
    absAoa.push([pname.get(e.user_id) || '', LEAVE_TYPES[e.type]?.label || e.type, asDate(e.start_date), asDate(e.end_date), PERIOD_LABELS[e.period], e.working_days, e.note || '']);
  }
  const wsA = XLSX.utils.aoa_to_sheet(absAoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
  wsA['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 40 }];
  wsA['!autofilter'] = { ref: `A1:G${absAoa.length}` };
  XLSX.utils.book_append_sheet(wb, wsA, 'Assenze');

  // Summary per person (working days of the absences in the period)
  const types = Object.keys(LEAVE_TYPES);
  const sumAoa: any[][] = [['Collaboratore', ...types.map(t => LEAVE_TYPES[t].label), 'Totale']];
  for (const p of people) {
    const t = types.map(k => entries.filter(e => e.user_id === p.id && e.type === k).reduce((a, e) => a + e.working_days, 0));
    sumAoa.push([p.name, ...t, t.reduce((a, b) => a + b, 0)]);
  }
  const wsS = XLSX.utils.aoa_to_sheet(sumAoa);
  wsS['!cols'] = [{ wch: 26 }, ...types.map(() => ({ wch: 11 })), { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsS, 'Riepilogo');

  // Closures
  const scopeKeys = Object.keys(SCOPES);
  const clAoa: any[][] = [['Azienda', 'Paese', 'Dal', 'Al', ...scopeKeys.map(s => SCOPES[s].label), 'Note']];
  for (const c of [...closures].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    clAoa.push([c.company_name, c.company_country, asDate(c.start_date), asDate(c.end_date), ...scopeKeys.map(s => (c.scopes.includes(s) || (s !== 'totale' && c.scopes.includes('totale')) ? 'X' : '')), c.note || '']);
  }
  const wsC = XLSX.utils.aoa_to_sheet(clAoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
  wsC['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, ...scopeKeys.map(() => ({ wch: 13 })), { wch: 40 }];
  wsC['!autofilter'] = { ref: `A1:J${clAoa.length}` };
  XLSX.utils.book_append_sheet(wb, wsC, 'Chiusure aziende');

  // Holidays
  const hAoa: any[][] = [['Data', 'Giorno', 'Paese', 'Festività']];
  for (const h of holidays) hAoa.push([asDate(h.date), WEEKDAYS[weekday(h.date)], cname.get(h.country) || h.country, h.name]);
  const wsH = XLSX.utils.aoa_to_sheet(hAoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
  wsH['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 46 }];
  wsH['!autofilter'] = { ref: `A1:D${hAoa.length}` };
  XLSX.utils.book_append_sheet(wb, wsH, 'Festività');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(data.label)}.xlsx`);
}

// ============================== PDF ==============================
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  ink: hex('#2C2926'), muted: hex('#6B6560'), line: hex('#DDD8D0'), head: hex('#4A6078'),
  weekend: hex('#EFECE7'), hol: hex('#F6DEDA'), holText: hex('#9E3F38'), white: [255, 255, 255] as RGB, band: hex('#F5F3EF'),
};

export function exportFeriePdf(data: FerieExportData) {
  const { from, to, people, countries } = data;
  const entries = inRange(data.entries, from, to);
  const closures = inRange(data.closures, from, to);
  const holidays = data.holidays.filter(h => h.date >= from && h.date <= to);
  const cname = new Map(countries.map(c => [c.code, c.name]));
  const pname = new Map(people.map(p => [p.id, p.name]));
  const itHol = new Set(holidays.filter(h => h.country === 'IT').map(h => h.date));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;

  const header = (title: string, sub?: string) => {
    doc.setFillColor(...C.head);
    doc.rect(0, 0, W, 16, 'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(pdfText(title), M, 10.5);
    if (sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(pdfText(sub), W - M, 10.5, { align: 'right' });
    }
    doc.setTextColor(...C.ink);
  };

  let first = true;
  const newPage = () => { if (!first) doc.addPage(); first = false; };

  // ---- One planner page per month ----
  for (const { y, m } of months(from, to)) {
    newPage();
    header(`Ferie Primula - ${MONTHS[m]} ${y}`, `Stampato il ${fmtDate(new Date().toISOString().slice(0, 10))}`);
    const n = daysInMonth(y, m);
    const days = Array.from({ length: n }, (_, i) => ymd(y, m, i + 1));
    const nameW = 42;
    const dayW = (W - 2 * M - nameW) / n;

    const head = [['', ...days.map(d => `${Number(d.slice(8))}\n${WEEKDAYS_SHORT[weekday(d)]}`)]];
    const body: any[][] = [];
    const meta: ({ kind: 'person'; id: string } | { kind: 'asia' } | { kind: 'closure'; c: Closure } | { kind: 'section' })[] = [];

    const asiaRow = ['Festivita Asia', ...days.map(d => [...new Set(holidays.filter(h => h.date === d && h.country !== 'IT').map(h => h.country))].join('\n'))];
    body.push(asiaRow); meta.push({ kind: 'asia' });
    for (const p of people) {
      body.push([pdfText(p.name), ...days.map(d => cellEntries(entries, p.id, d).map(e => (e.period === 'full' ? '' : '½') + SHORT[e.type]).join(' '))]);
      meta.push({ kind: 'person', id: p.id });
    }
    const monthClosures = inRange(closures, days[0], days[n - 1]);
    if (monthClosures.length) {
      body.push(['Chiusure aziende', ...days.map(() => '')]); meta.push({ kind: 'section' });
      for (const c of monthClosures) {
        body.push([pdfText(c.company_name), ...days.map(d => (c.start_date <= d && c.end_date >= d ? (c.scopes.includes('totale') ? 'TOT' : c.scopes.map(s => SCOPES[s]?.short[0]).join('')) : ''))]);
        meta.push({ kind: 'closure', c });
      }
    }

    autoTable(doc, {
      startY: 21,
      margin: { left: M, right: M },
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 0.8, halign: 'center', valign: 'middle', lineColor: C.line, lineWidth: 0.15, textColor: C.ink, minCellHeight: 6.2 },
      headStyles: { fillColor: C.white, textColor: C.muted, fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: nameW, halign: 'left', fontStyle: 'bold', fontSize: 7.5 }, ...Object.fromEntries(days.map((_, i) => [i + 1, { cellWidth: dayW }])) },
      didParseCell: (h) => {
        const col = h.column.index;
        if (col === 0) {
          if (h.section === 'body' && (meta[h.row.index]?.kind === 'section' || meta[h.row.index]?.kind === 'asia')) {
            h.cell.styles.textColor = C.muted;
            h.cell.styles.fontStyle = 'italic';
          }
          if (h.section === 'body' && meta[h.row.index]?.kind === 'section') h.cell.styles.fillColor = C.band;
          return;
        }
        const d = days[col - 1];
        const off = isWeekend(d) || itHol.has(d);
        if (h.section === 'head') {
          if (itHol.has(d)) { h.cell.styles.fillColor = C.hol; h.cell.styles.textColor = C.holText; }
          else if (isWeekend(d)) h.cell.styles.fillColor = C.weekend;
          return;
        }
        const row = meta[h.row.index];
        if (off) h.cell.styles.fillColor = itHol.has(d) ? C.hol : C.weekend;
        if (!row) return;
        if (row.kind === 'section') { h.cell.styles.fillColor = C.band; return; }
        if (row.kind === 'asia') { h.cell.styles.fontSize = 4.8; h.cell.styles.textColor = C.holText; return; }
        if (row.kind === 'person') {
          const list = cellEntries(entries, row.id, d);
          if (list.length) {
            const t = LEAVE_TYPES[list[0].type] || LEAVE_TYPES.altro;
            h.cell.styles.fillColor = off ? hex(t.soft) : hex(list.some(e => e.period === 'full') ? t.color : t.soft);
            h.cell.styles.textColor = off ? hex(t.text) : (list.some(e => e.period === 'full') ? C.white : hex(t.text));
            h.cell.styles.fontStyle = 'bold';
          }
        }
        if (row.kind === 'closure' && row.c.start_date <= d && row.c.end_date >= d) {
          const s = row.c.scopes.includes('totale') ? 'totale' : row.c.scopes[0];
          h.cell.styles.fillColor = hex(SCOPES[s]?.color || '#888888');
          h.cell.styles.textColor = C.white;
          h.cell.styles.fontSize = 5;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Legend + the holidays of the month in words
    let yPos = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(7);
    let x = M;
    for (const [k, t] of Object.entries(LEAVE_TYPES)) {
      doc.setFillColor(...hex(t.color)); doc.rect(x, yPos - 2.6, 3.2, 3.2, 'F');
      doc.setTextColor(...C.ink); doc.text(`${SHORT[k]} ${t.label}`, x + 4.4, yPos);
      x += 26;
    }
    doc.setTextColor(...C.muted);
    doc.text('½ = mezza giornata   TOT = chiusura totale   U/P/S/C = uffici / produzione / spedizioni / campioni', x + 2, yPos);
    const monthHol = holidays.filter(h => h.date >= days[0] && h.date <= days[n - 1]);
    if (monthHol.length) {
      yPos += 6;
      doc.setTextColor(...C.ink); doc.setFont('helvetica', 'bold'); doc.text('Festivita del mese:', M, yPos);
      doc.setFont('helvetica', 'normal');
      const txt = monthHol.map(h => `${Number(h.date.slice(8))} ${h.country} ${pdfText(h.name)}`).join('  ·  ');
      const lines = doc.splitTextToSize(txt.replace(/·/g, '|'), W - 2 * M - 26);
      doc.text(lines.slice(0, Math.max(1, Math.floor((H - yPos - 6) / 3.2))), M + 26, yPos);
    }
  }

  // ---- List pages ----
  const listPage = (title: string, head: string[], rows: any[][], widths?: Record<number, number>) => {
    newPage();
    header(`Ferie Primula - ${title}`, data.label);
    autoTable(doc, {
      startY: 21,
      margin: { left: M, right: M },
      head: [head],
      body: rows.length ? rows : [[{ content: 'Nessun dato nel periodo', colSpan: head.length, styles: { textColor: C.muted, halign: 'center' } } as any]],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: C.ink },
      headStyles: { fillColor: C.head, textColor: C.white },
      alternateRowStyles: { fillColor: C.band },
      columnStyles: Object.fromEntries(Object.entries(widths || {}).map(([k, v]) => [k, { cellWidth: v }])),
    });
  };

  const sorted = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date));
  listPage('Assenze', ['Collaboratore', 'Tipo', 'Dal', 'Al', 'Durata', 'Gg lav.', 'Note'],
    sorted.map(e => [pdfText(pname.get(e.user_id) || ''), LEAVE_TYPES[e.type]?.label, fmtDate(e.start_date), fmtDate(e.end_date), PERIOD_LABELS[e.period], String(e.working_days).replace('.', ','), pdfText(e.note || '')]),
    { 0: 50, 1: 24, 2: 24, 3: 24, 4: 30, 5: 16 });

  const types = Object.keys(LEAVE_TYPES);
  listPage('Riepilogo giorni lavorativi', ['Collaboratore', ...types.map(t => LEAVE_TYPES[t].label), 'Totale'],
    people.map(p => {
      const t = types.map(k => entries.filter(e => e.user_id === p.id && e.type === k).reduce((a, e) => a + e.working_days, 0));
      return [pdfText(p.name), ...t.map(v => (v ? String(v).replace('.', ',') : '-')), String(t.reduce((a, b) => a + b, 0)).replace('.', ',')];
    }));

  listPage('Chiusure aziende', ['Azienda', 'Paese', 'Dal', 'Al', 'Chiuso', 'Note'],
    [...closures].sort((a, b) => a.start_date.localeCompare(b.start_date)).map(c => [pdfText(c.company_name), pdfText(c.company_country), fmtDate(c.start_date), fmtDate(c.end_date), c.scopes.map(s => SCOPES[s]?.label).join(', '), pdfText(c.note || '')]),
    { 0: 60, 1: 24, 2: 24, 3: 24, 4: 55 });

  listPage('Festivita', ['Data', 'Giorno', 'Paese', 'Festivita'],
    holidays.map(h => [fmtDate(h.date), WEEKDAYS[weekday(h.date)], pdfText(cname.get(h.country) || h.country), pdfText(h.name)]),
    { 0: 26, 1: 26, 2: 34 });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`TradeFlow - Ferie Primula · ${i}/${pages}`.replace('·', '-'), W - M, H - 5, { align: 'right' });
  }

  doc.save(`${fileBase(data.label)}.pdf`);
}

