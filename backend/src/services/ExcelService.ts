import * as XLSX from 'xlsx';

export class ExcelService {
  /**
   * Genera un Excel per uno o più ordini
   */
  generateOrdersExcel(orders: any[]): Buffer {
    // Crea un workbook
    const workbook = XLSX.utils.book_new();

    // Aggiungi un foglio per ogni ordine con dettagli
    orders.forEach((order, index) => {
      if (order.items && order.items.length > 0) {
        const itemsData = order.items.map((item: any, itemIndex: number) => {
          // Se è solo commento (quantity = 0, unit_of_measure vuoto)
          if (item.quantity === 0 && !item.unit_of_measure) {
            return {
              'Item': itemIndex + 1,
              'Commento': item.description,
            };
          }
          // Altrimenti è una riga normale
          return {
            'Item': itemIndex + 1,
            'Codice Articolo': item.article_code || '',
            'Descrizione': item.description,
            'Formato': item.format || '',
            'UM': item.unit_of_measure,
            'Quantità': item.quantity,
            'Prezzo Unitario': item.unit_price,
            'Sconto': item.discount || '',
          };
        });

        const itemsSheet = XLSX.utils.json_to_sheet(itemsData);
        itemsSheet['!cols'] = [
          { wch: 4 },
          { wch: 15 },
          { wch: 25 },
          { wch: 12 },
          { wch: 8 },
          { wch: 10 },
          { wch: 12 },
          { wch: 10 },
        ];

        const sheetName = `Ordine_${index + 1}`;
        XLSX.utils.book_append_sheet(workbook, itemsSheet, sheetName);
      }
    });

    // Genera il buffer
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per un singolo ordine
   */
  generateOrderExcel(order: any): Buffer {
    return this.generateOrdersExcel([order]);
  }

  /**
   * Genera Excel con confronto ordini per visita
   */
  generateVisitOrdersExcel(visitData: {
    visit_date: string;
    client_name: string;
    orders: any[];
  }): Buffer {
    // Foglio 1: Info Visita
    const visitInfo = [
      { Campo: 'Data Visita', Valore: new Date(visitData.visit_date).toLocaleDateString('it-IT') },
      { Campo: 'Cliente', Valore: visitData.client_name },
      { Campo: 'Numero Ordini', Valore: visitData.orders.length },
      { Campo: 'Importo Totale', Valore: visitData.orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) },
    ];

    const workbook = XLSX.utils.book_new();
    const infoSheet = XLSX.utils.json_to_sheet(visitInfo);
    infoSheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info Visita');

    // Continua con gli ordini
    const summaryData = visitData.orders.map((order, index) => ({
      'N.': index + 1,
      'ID Ordine': order.id.substring(0, 8),
      'Data': new Date(order.order_date).toLocaleDateString('it-IT'),
      'Pagamento': order.payment_method || '',
      'Righe': order.items?.length || 0,
      'Importo': order.total_amount || 0,
      'Status': order.status || 'draft',
    }));

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [
      { wch: 4 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 6 },
      { wch: 12 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ordini');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }
}
