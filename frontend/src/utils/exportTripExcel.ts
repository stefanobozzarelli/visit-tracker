import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  programmato: 'Programmato', confermato: 'Confermato',
  in_attesa: 'In attesa', sollecitato: 'Sollecitato',
  da_modificare: 'Da modificare', rifiutato: 'Rifiutato', fatto_report: 'Fatto report',
};

export function exportTripExcel(trip: any) {
  const locale = 'it-IT';
  const wb = XLSX.utils.book_new();
  const sorted = [...trip.days].sort((a: any, b: any) => a.date.localeCompare(b.date));

  // Itinerary sheet
  const maxFlights = Math.max(...sorted.map((d: any) => d.flights.length), 0);
  const maxApts = Math.max(...sorted.map((d: any) => d.appointments.length), 0);

  const header: string[] = ['Data', 'Giorno', 'Localita'];
  for (let i = 1; i <= maxFlights; i++) {
    const sfx = maxFlights > 1 ? ` ${i}` : '';
    header.push(`Volo - Tratta${sfx}`, `Volo - Dettagli${sfx}`);
  }
  header.push('Hotel', 'Note');
  for (let i = 1; i <= maxApts; i++) {
    header.push(`Ora Inizio ${i}`, `Ora Fine ${i}`, `Cliente ${i}`, `Stato ${i}`);
  }

  const rows = sorted.map((day: any) => {
    const d = new Date(day.date + 'T00:00:00');
    const row: any[] = [
      d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
      d.toLocaleDateString(locale, { weekday: 'long' }),
      day.location,
    ];
    for (let i = 0; i < maxFlights; i++) {
      row.push(day.flights[i]?.route || '', day.flights[i]?.details || '');
    }
    row.push(day.hotel || '', day.notes || '');
    for (let i = 0; i < maxApts; i++) {
      const a = day.appointments[i];
      row.push(a?.time || '', a?.endTime || '', a?.client || '', a ? (STATUS_LABELS[a.status] || a.status) : '');
    }
    return row;
  });

  const ws1 = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws1['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 22 },
    ...Array(maxFlights * 2).fill(null).map((_: any, i: number) => ({ wch: i % 2 === 0 ? 20 : 30 })),
    { wch: 35 }, { wch: 20 },
    ...Array(maxApts * 4).fill(null).map((_: any, i: number) => ({ wch: i % 4 < 2 ? 10 : i % 4 === 2 ? 25 : 16 })),
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Itinerario');

  // Flights sheet
  const allFlights = sorted.flatMap((d: any) => d.flights.map((f: any) => ({ ...f, date: d.date })));
  if (allFlights.length > 0) {
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Data', 'Tratta', 'Dettagli', 'Stato'],
      ...allFlights.map((f: any) => [
        new Date(f.date + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        f.route, f.details, STATUS_LABELS[f.status] || f.status,
      ]),
    ]);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 40 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Voli');
  }

  // Hotels sheet
  const hotelDays = sorted.filter((d: any) => d.hotel);
  if (hotelDays.length > 0) {
    const blocks: any[] = [];
    let cur: any = null;
    for (const d of hotelDays) {
      if (cur && cur.hotel === d.hotel) { cur.checkOut = d.date; cur.nights++; }
      else { if (cur) blocks.push(cur); cur = { hotel: d.hotel, checkIn: d.date, checkOut: d.date, nights: 1 }; }
    }
    if (cur) blocks.push(cur);
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['Hotel', 'Check-in', 'Check-out', 'Notti'],
      ...blocks.map((h: any) => [h.hotel,
        new Date(h.checkIn + 'T00:00:00').toLocaleDateString(locale),
        new Date(h.checkOut + 'T00:00:00').toLocaleDateString(locale),
        h.nights]),
    ]);
    ws3['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Hotel');
  }

  // Appointments sheet
  const aptDays = sorted.filter((d: any) => d.appointments.length > 0);
  if (aptDays.length > 0) {
    const aptRows: any[][] = [];
    for (const d of aptDays) {
      const ds = new Date(d.date + 'T00:00:00').toLocaleDateString(locale);
      for (const a of d.appointments) {
        aptRows.push([ds, d.location, a.time || '—', a.endTime || '', a.client, STATUS_LABELS[a.status] || a.status, a.notes || '']);
      }
    }
    const ws4 = XLSX.utils.aoa_to_sheet([['Data', 'Localita', 'Ora Inizio', 'Ora Fine', 'Cliente', 'Stato', 'Note'], ...aptRows]);
    ws4['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Appuntamenti');
  }

  XLSX.writeFile(wb, `${trip.name.replace(/\s+/g, '_')}.xlsx`);
}
