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

      // Generation date
      if (options.generatedAt) {
        doc.fontSize(10)
          .font('Helvetica')
          .text(`Generated on: ${options.generatedAt.toLocaleDateString('en-US')}`, { align: 'right' });
      }

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

        // Report per company
        if (visit.reports && visit.reports.length > 0) {
          visit.reports.forEach(report => {
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

      // Footer
      doc.fontSize(9)
        .font('Helvetica')
        .text('---', { align: 'center' });
      doc.moveDown(0.2);
      doc.fillColor('#999999')
        .text('Questo documento è stato generato automaticamente dal sistema Visit Tracker', {
          align: 'center',
        });
      doc.fillColor('#000000');

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
