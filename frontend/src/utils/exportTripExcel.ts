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
    const hotelsForDay = (trip.hotels || []).filter((h: any) => h.checkIn <= day.date && h.checkOut >= day.date);
    row.push(hotelsForDay.map((h: any) => h.name).join(', '), day.notes || '');
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
  const tripHotels = (trip.hotels || []).slice().sort((a: any, b: any) => a.checkIn.localeCompare(b.checkIn));
  if (tripHotels.length > 0) {
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['Hotel', 'Check-in', 'Check-out', 'Notti', 'Stato'],
      ...tripHotels.map((h: any) => {
        const ci = new Date(h.checkIn + 'T00:00:00');
        const co = new Date(h.checkOut + 'T00:00:00');
        const nights = Math.round((co.getTime() - ci.getTime()) / 86400000) + 1;
        const coDisplay = new Date(co); coDisplay.setDate(coDisplay.getDate() + 1);
        return [
          h.name,
          ci.toLocaleDateString(locale),
          coDisplay.toLocaleDateString(locale),
          nights,
          STATUS_LABELS[h.status] || h.status || '',
        ];
      }),
    ]);
    ws3['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 16 }];
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
