import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { Visit } from '../entities/Visit';

export class PdfService {
  /**
   * Generate a PDF with one or more visits
   */
  generateVisitsPdf(visits: Visit[], options: { title?: string; generatedAt?: Date } = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text(options.title || 'Visit Report', { align: 'center' });
      doc.moveDown(0.5);

      doc.moveDown(1);

      // Sezione visite
      visits.forEach((visit, index) => {
        if (index > 0) {
          doc.addPage();
        }

        // Client name in large
        doc.fontSize(13)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text(`${visit.client?.name || 'N/A'}`);
        doc.moveDown(0.3);

        // Visit info
        doc.fontSize(11).font('Helvetica');
        const visitDate = typeof visit.visit_date === 'string'
          ? new Date(visit.visit_date).toLocaleDateString('en-US')
          : visit.visit_date.toLocaleDateString('en-US');
        doc.text(`Visit date: ${visitDate}`);
        doc.text(`Visited by: ${visit.visited_by_user?.name || 'N/A'}`);
        doc.moveDown(0.5);

        // Report per company (skip __metadata__ section)
        if (visit.reports && visit.reports.length > 0) {
          visit.reports.filter(report => report.section !== '__metadata__').forEach(report => {
            doc.fontSize(10)
              .font('Helvetica-Bold')
              .fillColor('#0066CC')
              .text(`${report.company?.name || 'N/A'} - ${report.section}:`);

            doc.fontSize(10)
              .font('Helvetica')
              .fillColor('#000000')
              .text(report.content || '(Nessun contenuto)', {
                width: 450,
              });

            doc.moveDown(0.3);
          });
        }

        doc.moveDown(1);
      });

      doc.end();
    });
  }

  /**
   * Genera un PDF per una singola visita
   */
  async generateVisitPdf(visit: Visit): Promise<Buffer> {
    return this.generateVisitsPdf([visit], {
      title: `Visita: ${visit.client?.name}`,
      generatedAt: new Date(),
    });
  }

  /**
   * Genera un PDF per uno o più ordini clienti
   */
  generateOrdersPdf(orders: any[], options: { title?: string; generatedAt?: Date } = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text(options.title || 'Ordini Clienti', { align: 'center' });
      doc.moveDown(0.5);

      // Data di generazione
      if (options.generatedAt) {
        doc.fontSize(10)
          .font('Helvetica')
          .text(`Generato il: ${options.generatedAt.toLocaleDateString('it-IT')}`, { align: 'right' });
      }

      doc.moveDown(1);

      // Sezione ordini
      orders.forEach((order, index) => {
        if (index > 0) {
          doc.addPage();
        }

        // Info testata
        doc.fontSize(10).font('Helvetica');
        doc.text(`Data Ordine: ${new Date(order.order_date).toLocaleDateString('it-IT')}`);

        // Fornitore - più grande
        doc.fontSize(13).font('Helvetica-Bold');
        doc.text(`Fornitore: ${order.supplier_name || 'N/A'}`);

        // Resto info
        doc.fontSize(10).font('Helvetica');
        doc.text(`Pagamento: ${order.payment_method || 'N/A'}`);
        doc.text(`Status: ${order.status || 'draft'}`);
        if (order.notes) {
          doc.text(`Note: ${order.notes}`);
        }
        doc.moveDown(0.8);

        // Tabella righe ordine
        if (order.items && order.items.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').text('Righe Ordine:');
          doc.moveDown(0.3);

          // Intestazione tabella - allineata su una singola riga
          const headers = ['Codice', 'Descrizione', 'UM', 'Qta', 'Prezzo', 'Sconto'];
          const columnWidths = [50, 140, 40, 45, 65, 60];
          let xPos = 50;
          const headerY = doc.y;

          doc.fontSize(9).font('Helvetica-Bold');
          headers.forEach((header, i) => {
            doc.text(header, xPos, headerY, { width: columnWidths[i], align: 'left' });
            xPos += columnWidths[i];
          });

          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(50 + columnWidths.reduce((a, b) => a + b, 0), doc.y).stroke();
          doc.moveDown(0.3);

          // Righe dati
          doc.font('Helvetica');
          doc.fontSize(8);
          order.items.forEach((item: any) => {
            try {
              const yBefore = doc.y;
              xPos = 50;

              // Convert quantity to number and check if it's a comment row
              const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : (item.quantity || 0);
              const unitOfMeasure = item.unit_of_measure || '';
              const isCommentRow = quantity === 0 && !unitOfMeasure;

              if (isCommentRow) {
                // Riga commento - mostra solo la descrizione su tutta la larghezza
                doc.font('Helvetica-Oblique');
                doc.text(item.description || '(No comment text)', xPos, yBefore, { width: 500, align: 'left' });
                doc.font('Helvetica');
              } else {
                // Riga ordine normale
                const unitPrice = typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : (item.unit_price || 0);

                // Codice
                doc.text((item.article_code || '').substring(0, 10), xPos, yBefore, { width: columnWidths[0], align: 'left' });
                xPos += columnWidths[0];
                // Descrizione
                doc.text((item.description || '').substring(0, 25), xPos, yBefore, { width: columnWidths[1], align: 'left' });
                xPos += columnWidths[1];
                // UM
                doc.text(unitOfMeasure, xPos, yBefore, { width: columnWidths[2], align: 'center' });
                xPos += columnWidths[2];
                // Qta
                doc.text(quantity.toFixed(2), xPos, yBefore, { width: columnWidths[3], align: 'right' });
                xPos += columnWidths[3];
                // Prezzo
                doc.text(`€ ${unitPrice.toFixed(2)}`, xPos, yBefore, { width: columnWidths[4], align: 'right' });
                xPos += columnWidths[4];
                // Sconto
                doc.text(`${item.discount || '-'}`, xPos, yBefore, { width: columnWidths[5], align: 'right' });
              }

              doc.moveDown(0.4);
            } catch (itemError) {
              console.error('Error processing order item:', itemError, item);
              doc.fontSize(8).text('Error rendering item', 50, doc.y);
              doc.moveDown(0.4);
            }
          });

          doc.moveTo(50, doc.y).lineTo(50 + columnWidths.reduce((a, b) => a + b, 0), doc.y).stroke();
          doc.moveDown(0.5);
        }

        doc.moveDown(0.8);
      });

      doc.end();
    });
  }

  /**
   * Genera PDF per un singolo ordine
   */
  async generateOrderPdf(order: any): Promise<Buffer> {
    return this.generateOrdersPdf([order], {
      title: `Ordine: ${order.client_name}`,
      generatedAt: new Date(),
    });
  }

  // ─── Private helper for table-based PDFs ───────────────────────────────────

  private _generateTablePdf(
    title: string,
    headers: { label: string; width: number }[],
    rows: string[][],
    options: { generatedAt?: Date; landscape?: boolean; groupByIndex?: number } = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      const isLandscape = options.landscape !== false;
      const doc = new PDFDocument({
        margin: 30,
        layout: isLandscape ? 'landscape' : 'portrait',
        size: 'A4',
      });

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const tableLeft = 30;
      const totalWidth = headers.reduce((sum, h) => sum + h.width, 0);
      const pageBottom = isLandscape ? 540 : 780;
      const ROW_HEIGHT = 14;
      const FONT_SIZE = 7;

      const drawPageTitle = (pageTitle: string) => {
        doc.fontSize(14).font('Helvetica-Bold').text(pageTitle, { align: 'center' });
        doc.moveDown(0.5);
      };

      const drawHeaders = () => {
        const headerY = doc.y;
        let xPos = tableLeft;
        doc.fontSize(FONT_SIZE).font('Helvetica-Bold').fillColor('#333333');
        headers.forEach((h) => {
          doc.text(h.label, xPos, headerY, { width: h.width, height: ROW_HEIGHT, align: 'left', ellipsis: true });
          xPos += h.width;
        });
        const lineY = headerY + ROW_HEIGHT + 2;
        doc.moveTo(tableLeft, lineY).lineTo(tableLeft + totalWidth, lineY).lineWidth(0.5).stroke();
        doc.y = lineY + 4;
      };

      const drawRows = (dataRows: string[][]) => {
        let rowIndex = 0;
        dataRows.forEach((row) => {
          if (doc.y + ROW_HEIGHT > pageBottom) {
            doc.addPage();
            drawHeaders();
          }
          const rowY = doc.y;
          if (rowIndex % 2 === 0) {
            doc.save();
            doc.rect(tableLeft, rowY - 1, totalWidth, ROW_HEIGHT).fill('#f8f8f8');
            doc.restore();
          }
          let xPos = tableLeft;
          doc.fontSize(FONT_SIZE).font('Helvetica').fillColor('#000000');
          headers.forEach((h, i) => {
            const cellText = (row[i] || '').substring(0, 50);
            doc.text(cellText, xPos, rowY, { width: h.width - 4, height: ROW_HEIGHT, align: 'left', ellipsis: true });
            xPos += h.width;
          });
          doc.y = rowY + ROW_HEIGHT;
          rowIndex++;
        });
        // Footer line
        doc.moveDown(0.3);
        doc.moveTo(tableLeft, doc.y).lineTo(tableLeft + totalWidth, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.2);
        doc.fontSize(7).font('Helvetica').fillColor('#666666')
          .text(`${dataRows.length} records`, { align: 'right' });
        doc.fillColor('#000000');
      };

      // Group by supplier (or other column) — one page per group
      if (options.groupByIndex !== undefined && options.groupByIndex >= 0) {
        const gi = options.groupByIndex;
        const groups: Map<string, string[][]> = new Map();
        rows.forEach((row) => {
          const key = row[gi] || 'N/A';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        });

        let isFirst = true;
        groups.forEach((groupRows, groupName) => {
          if (!isFirst) doc.addPage();
          isFirst = false;
          drawPageTitle(`${title} — ${groupName}`);
          drawHeaders();
          drawRows(groupRows);
        });

        if (rows.length === 0) {
          drawPageTitle(title);
          doc.fontSize(10).font('Helvetica').text('No data', { align: 'center' });
        }
      } else {
        drawPageTitle(title);
        drawHeaders();
        drawRows(rows);
      }

      doc.end();
    });
  }

  // ─── Entity PDF generators ────────────────────────────────────────────────

  /**
   * Generate PDF for clients list
   */
  generateClientsPdf(
    clients: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Name', width: 140 },
      { label: 'Country', width: 80 },
      { label: 'City', width: 100 },
      { label: 'Role', width: 100 },
      { label: 'Contacts', width: 60 },
      { label: 'Has Showroom', width: 80 },
    ];
    const rows = clients.map((c) => [
      c.name || '',
      c.country || '',
      c.city || '',
      c.role || '',
      String(c.contacts?.length ?? 0),
      c.showroom ? 'Yes' : 'No',
    ]);
    return this._generateTablePdf(options.title || 'Clients Report', headers, rows, {});
  }

  /**
   * Generate PDF for showrooms list
   */
  generateShowroomsPdf(
    showrooms: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Name', width: 120 },
      { label: 'Client', width: 100 },
      { label: 'Supplier', width: 100 },
      { label: 'Status', width: 70 },
      { label: 'Type', width: 70 },
      { label: 'SQM', width: 50 },
      { label: 'City', width: 80 },
      { label: 'Area', width: 80 },
    ];
    const rows = showrooms.map((s) => [
      s.name || '',
      s.client?.name || s.client_name || '',
      s.supplier?.name || s.supplier_name || '',
      s.status || '',
      s.type || '',
      s.sqm != null ? String(s.sqm) : '',
      s.city || '',
      s.area || '',
    ]);
    return this._generateTablePdf(options.title || 'Showrooms Report', headers, rows, {
      groupByIndex: 2, // group by Supplier column
    });
  }

  /**
   * Generate PDF for projects list
   */
  generateProjectsPdf(
    projects: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: '#', width: 40 },
      { label: 'Name', width: 160 },
      { label: 'Supplier', width: 110 },
      { label: 'Client', width: 120 },
      { label: 'Status', width: 70 },
      { label: 'Country', width: 80 },
      { label: 'Type', width: 90 },
      { label: 'Value', width: 80 },
    ];
    const rows = projects.map((p) => [
      p.project_number != null ? String(p.project_number) : '',
      p.project_name || '',
      p.supplier?.name || '',
      p.client?.name || '',
      p.status || '',
      p.country || '',
      p.project_type || '',
      p.project_value != null ? Number(p.project_value).toLocaleString() : '',
    ]);
    return this._generateTablePdf(options.title || 'Projects Report', headers, rows, {
      groupByIndex: 2, // group by Supplier column
    });
  }

  /**
   * Generate PDF for claims list
   */
  generateClaimsPdf(
    claims: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Date', width: 90 },
      { label: 'Client', width: 130 },
      { label: 'Company', width: 130 },
      { label: 'Status', width: 90 },
      { label: 'Comments', width: 200 },
    ];
    const rows = claims.map((c) => [
      c.date ? new Date(c.date).toLocaleDateString('en-US') : '',
      c.client?.name || c.client_name || '',
      c.company?.name || c.company_name || '',
      c.status || '',
      c.comments || c.description || '',
    ]);
    return this._generateTablePdf(options.title || 'Claims Report', headers, rows, {
      groupByIndex: 2, // group by Company column
    });
  }

  /**
   * Generate PDF for filtered orders list (table/summary view)
   */
  generateFilteredOrdersPdf(
    orders: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Date', width: 90 },
      { label: 'Supplier', width: 120 },
      { label: 'Client', width: 120 },
      { label: 'Status', width: 80 },
      { label: 'Payment', width: 100 },
      { label: 'Total', width: 80 },
    ];
    const rows = orders.map((o) => [
      o.order_date ? new Date(o.order_date).toLocaleDateString('en-US') : '',
      o.supplier_name || o.supplier?.name || '',
      o.client_name || o.client?.name || '',
      o.status || '',
      o.payment_method || '',
      o.total != null ? `€ ${Number(o.total).toFixed(2)}` : '',
    ]);
    return this._generateTablePdf(options.title || 'Orders Summary', headers, rows, {
      groupByIndex: 1, // group by Supplier column
    });
  }

  /**
   * Generate PDF for company visits list
   */
  generateCompanyVisitsPdf(
    visits: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Date', width: 90 },
      { label: 'Company', width: 130 },
      { label: 'Subject', width: 180 },
      { label: 'Status', width: 80 },
      { label: 'Participants', width: 150 },
    ];
    const rows = visits.map((v) => [
      v.visit_date ? new Date(v.visit_date).toLocaleDateString('en-US') : '',
      v.company?.name || v.company_name || '',
      v.subject || '',
      v.status || '',
      Array.isArray(v.participants)
        ? v.participants.map((p: any) => p.name || p).join(', ')
        : (v.participants || ''),
    ]);
    return this._generateTablePdf(options.title || 'Company Visits Report', headers, rows, {
      groupByIndex: 1, // group by Company column
    });
  }

  /**
   * Generate PDF for tasks list
   */
  generateTasksPdf(
    tasks: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Title', width: 150 },
      { label: 'Status', width: 80 },
      { label: 'Due Date', width: 90 },
      { label: 'Assigned To', width: 100 },
      { label: 'Client', width: 110 },
      { label: 'Company', width: 110 },
    ];
    const rows = tasks.map((t) => [
      t.title || '',
      t.status || '',
      t.due_date ? new Date(t.due_date).toLocaleDateString('en-US') : '',
      t.assigned_to?.name || t.assigned_to_name || '',
      t.client?.name || t.client_name || '',
      t.company?.name || t.company_name || '',
    ]);
    return this._generateTablePdf(options.title || 'Tasks Report', headers, rows, {
      groupByIndex: 5, // group by Company column
    });
  }

  /**
   * Generate PDF for offers list
   */
  generateOffersPdf(
    offers: any[],
    options: { title?: string; generatedAt?: Date } = {},
  ): Promise<Buffer> {
    const headers = [
      { label: 'Date', width: 70 },
      { label: 'Client', width: 120 },
      { label: 'Supplier', width: 110 },
      { label: 'Project', width: 120 },
      { label: 'Status', width: 70 },
      { label: 'Items', width: 45 },
      { label: 'Total', width: 80 },
      { label: 'Valid Until', width: 75 },
    ];
    const rows = offers.map((o) => [
      o.offer_date ? new Date(o.offer_date).toLocaleDateString('en-US') : '',
      o.client?.name || '',
      o.company?.name || '',
      o.project?.project_name || '',
      o.status || '',
      String(o.items?.length || 0),
      o.total_amount != null ? Number(o.total_amount).toLocaleString() : '0',
      o.valid_until ? new Date(o.valid_until).toLocaleDateString('en-US') : '',
    ]);
    return this._generateTablePdf(options.title || 'Offers Report', headers, rows, {
      groupByIndex: 2, // group by Supplier column
    });
  }

  /**
   * Converte il buffer in uno stream leggibile
   */
  bufferToStream(buffer: Buffer): Readable {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
  }
}
