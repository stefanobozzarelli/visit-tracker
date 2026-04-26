import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
  blueFusion: [80, 106, 126] as [number, number, number],
  balticSea: [106, 174, 214] as [number, number, number],
  cloudDancer: [240, 237, 229] as [number, number, number],
  veiledVista: [197, 217, 195] as [number, number, number],
  quietViolet: [176, 157, 181] as [number, number, number],
  hematite: [122, 119, 116] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const STATUS_LABELS: Record<string, string> = {
  programmato: 'Programmato', confermato: 'Confermato',
  in_attesa: 'In attesa', sollecitato: 'Sollecitato',
  da_modificare: 'Da modificare', rifiutato: 'Rifiutato', fatto_report: 'Fatto report',
};

export function exportTripPdf(trip: any) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const locale = 'it-IT';

  // Cover
  doc.setFillColor(...COLORS.blueFusion);
  doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...COLORS.balticSea);
  doc.rect(0, H - 40, W, 40, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(36); doc.setFont('helvetica', 'bold');
  doc.text(trip.name, W / 2, 70, { align: 'center' });
  doc.setFontSize(16); doc.setFont('helvetica', 'normal');
  const s = new Date(trip.startDate + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const e = new Date(trip.endDate + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`${s} — ${e}`, W / 2, 85, { align: 'center' });
  doc.setFontSize(12);
  const totalApts = trip.days.reduce((s: number, d: any) => s + d.appointments.length, 0);
  const totalFlights = trip.days.reduce((s: number, d: any) => s + d.flights.length, 0);
  const hotels = (trip.hotels || []).length;
  doc.text(`${trip.days.length} giorni · ${totalFlights} voli · ${hotels} hotel · ${totalApts} appuntamenti`, W / 2, 95, { align: 'center' });
  const locations = [...new Set(trip.days.map((d: any) => d.location).filter(Boolean))];
  doc.setFontSize(10); doc.setTextColor(200, 220, 240);
  doc.text((locations as string[]).join('  ·  '), W / 2, 115, { align: 'center', maxWidth: W - 40 });

  // Itinerary
  doc.addPage();
  doc.setFillColor(...COLORS.blueFusion);
  doc.rect(0, 0, W, 18, 'F');
  doc.setTextColor(...COLORS.white); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('ITINERARIO COMPLETO', 14, 12);

  const sorted = [...trip.days].sort((a: any, b: any) => a.date.localeCompare(b.date));
  const tableData = sorted.map((day: any) => {
    const d = new Date(day.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
    const flightStr = day.flights.map((f: any) => `${f.route}\n${f.details}`).join('\n\n');
    const aptsStr = day.appointments.map((a: any) => {
      const t = a.time ? (a.endTime ? `${a.time}-${a.endTime}` : a.time) : '—';
      return `${t} ${a.client} [${STATUS_LABELS[a.status] || a.status}]`;
    }).join('\n');
    const hotelsForDay = (trip.hotels || []).filter((h: any) => h.checkIn <= day.date && h.checkOut >= day.date);
    const hotelStr = hotelsForDay.map((h: any) => h.name).join(', ');
    return [dateStr, day.location, flightStr, hotelStr, aptsStr, day.notes];
  });

  autoTable(doc, {
    startY: 22,
    head: [['Data', 'Localita', 'Volo', 'Hotel', 'Appuntamenti', 'Note']],
    body: tableData, theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
    headStyles: { fillColor: COLORS.blueFusion, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 246, 242] },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 35 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 }, 4: { cellWidth: 85 }, 5: { cellWidth: 30 } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2 && data.cell.raw)
        data.cell.styles.textColor = COLORS.balticSea;
    },
  });

  // Flights
  const allFlights = sorted.flatMap((day: any) => day.flights.map((f: any) => ({ ...f, date: day.date })));
  if (allFlights.length > 0) {
    doc.addPage();
    doc.setFillColor(...COLORS.balticSea); doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(...COLORS.white); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('VOLI', 14, 12);
    autoTable(doc, {
      startY: 22,
      head: [['Data', 'Tratta', 'Dettagli', 'Stato']],
      body: allFlights.map((f: any) => [
        new Date(f.date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' }),
        f.route, f.details, STATUS_LABELS[f.status] || f.status,
      ]),
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: COLORS.balticSea, textColor: COLORS.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 255] },
    });
  }

  // Hotels
  const tripHotels = (trip.hotels || []).slice().sort((a: any, b: any) => a.checkIn.localeCompare(b.checkIn));
  if (tripHotels.length > 0) {
    doc.addPage();
    doc.setFillColor(...COLORS.quietViolet); doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(...COLORS.white); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('HOTEL', 14, 12);
    autoTable(doc, {
      startY: 22, head: [['Hotel', 'Check-in', 'Check-out', 'Notti', 'Stato']],
      body: tripHotels.map((h: any) => {
        const ci = new Date(h.checkIn + 'T00:00:00');
        const co = new Date(h.checkOut + 'T00:00:00');
        const nights = Math.round((co.getTime() - ci.getTime()) / 86400000) + 1;
        const coDisplay = new Date(co); coDisplay.setDate(coDisplay.getDate() + 1);
        return [
          h.name,
          ci.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
          coDisplay.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
          `${nights} nott${nights === 1 ? 'e' : 'i'}`,
          STATUS_LABELS[h.status] || h.status || '',
        ];
      }),
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: COLORS.quietViolet, textColor: COLORS.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 244, 250] },
    });
  }

  // Appointments
  const aptDays = sorted.filter((d: any) => d.appointments.length > 0);
  if (aptDays.length > 0) {
    doc.addPage();
    doc.setFillColor(...COLORS.veiledVista); doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(...COLORS.blueFusion); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('APPUNTAMENTI', 14, 12);
    const aptData: string[][] = [];
    for (const day of aptDays) {
      const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
      for (const a of day.appointments) {
        const t = a.time ? (a.endTime ? `${a.time}-${a.endTime}` : a.time) : '—';
        aptData.push([dateStr, day.location, t, a.client, STATUS_LABELS[a.status] || a.status, a.notes]);
      }
    }
    autoTable(doc, {
      startY: 22, head: [['Data', 'Localita', 'Ora', 'Cliente', 'Stato', 'Note']],
      body: aptData, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.2 },
      headStyles: { fillColor: [74, 110, 72], textColor: COLORS.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 250, 245] },
    });
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(...COLORS.hematite);
    doc.text(`${trip.name} — Pagina ${i}/${total}`, W / 2, H - 5, { align: 'center' });
  }

  doc.save(`${trip.name.replace(/\s+/g, '_')}.pdf`);
}
