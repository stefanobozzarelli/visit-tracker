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

  /**
   * Genera Excel per le visite
   */
  generateVisitsExcel(visits: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = visits.map((visit: any) => {
      let dateStr = 'N/A';
      try {
        dateStr = new Date(visit.date || visit.visit_date).toLocaleDateString('it-IT');
      } catch (e) {
        dateStr = 'N/A';
      }
      return {
        'Date': dateStr,
        'Client': visit.client?.name || 'N/A',
        'Sales Rep': visit.salesRep?.name || visit.sales_rep?.name || 'N/A',
        'Status': visit.status || 'N/A',
        'Reports Count': visit.reports?.length || visit.reports_count || 0,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 12 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Visits');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per i clienti
   */
  generateClientsExcel(clients: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = clients.map((client: any) => ({
      'Name': client.name || 'N/A',
      'Country': client.country || 'N/A',
      'City': client.city || 'N/A',
      'Role': client.role || 'N/A',
      'Contacts': client.contacts?.length || client.contacts_count || 0,
      'Has Showroom': client.has_showroom ? 'Yes' : 'No',
      'Showroom Count': client.showrooms?.length || client.showroom_count || 0,
    }));

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 14 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Clients');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per gli showroom
   */
  generateShowroomsExcel(showrooms: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = showrooms.map((showroom: any) => ({
      'Name': showroom.name || 'N/A',
      'Client': showroom.client?.name || 'N/A',
      'Supplier': showroom.supplier?.name || 'N/A',
      'Status': showroom.status || 'N/A',
      'Type': showroom.type || 'N/A',
      'SQM': showroom.sqm || 0,
      'City': showroom.city || 'N/A',
      'Province': showroom.province || 'N/A',
      'Area': showroom.area || 'N/A',
      'Latitude': showroom.latitude || 'N/A',
      'Longitude': showroom.longitude || 'N/A',
    }));

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 8 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Showrooms');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per i progetti
   */
  generateProjectsExcel(projects: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = projects.map((project: any) => {
      let regDateStr = 'N/A';
      try {
        regDateStr = new Date(project.registration_date).toLocaleDateString('it-IT');
      } catch (e) {
        regDateStr = 'N/A';
      }
      return {
        'Project #': project.project_number || project.id || 'N/A',
        'Name': project.name || 'N/A',
        'Supplier': project.supplier?.name || 'N/A',
        'Client': project.client?.name || 'N/A',
        'Status': project.status || 'N/A',
        'Country': project.country || 'N/A',
        'Type': project.type || 'N/A',
        'Detail Type': project.detail_type || 'N/A',
        'Area': project.area || 'N/A',
        'Architect': project.architect || 'N/A',
        'Developer': project.developer || 'N/A',
        'Item': project.item || 'N/A',
        'Quantity': project.quantity || 0,
        'Value': project.value || 0,
        'Shipped Value': project.shipped_value || 0,
        'Registration Date': regDateStr,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Projects');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per i reclami
   */
  generateClaimsExcel(claims: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = claims.map((claim: any) => {
      let dateStr = 'N/A';
      try {
        dateStr = new Date(claim.date || claim.created_at).toLocaleDateString('it-IT');
      } catch (e) {
        dateStr = 'N/A';
      }
      return {
        'Date': dateStr,
        'Client': claim.client?.name || 'N/A',
        'Company': claim.company?.name || claim.company || 'N/A',
        'Status': claim.status || 'N/A',
        'Comments': claim.comments || claim.description || 'N/A',
        'Created By': claim.createdBy?.name || claim.created_by?.name || 'N/A',
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 12 },
      { wch: 35 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Claims');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per ordini filtrati (vista riassuntiva)
   */
  generateFilteredOrdersExcel(orders: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = orders.map((order: any) => {
      let dateStr = 'N/A';
      try {
        dateStr = new Date(order.order_date || order.date).toLocaleDateString('it-IT');
      } catch (e) {
        dateStr = 'N/A';
      }
      return {
        'Date': dateStr,
        'Supplier': order.supplier?.name || 'N/A',
        'Client': order.client?.name || 'N/A',
        'Status': order.status || 'N/A',
        'Payment': order.payment_method || 'N/A',
        'Items Count': order.items?.length || order.items_count || 0,
        'Total Amount': order.total_amount || 0,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 25 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Orders');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per visite aziendali
   */
  generateCompanyVisitsExcel(visits: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = visits.map((visit: any) => {
      let dateStr = 'N/A';
      try {
        dateStr = new Date(visit.date || visit.visit_date).toLocaleDateString('it-IT');
      } catch (e) {
        dateStr = 'N/A';
      }
      return {
        'Date': dateStr,
        'Company': visit.company?.name || visit.company || 'N/A',
        'Subject': visit.subject || 'N/A',
        'Status': visit.status || 'N/A',
        'Participants': Array.isArray(visit.participants)
          ? visit.participants.map((p: any) => p.name || p).join(', ')
          : (visit.participants || 'N/A'),
        'Report': visit.report || 'N/A',
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 25 },
      { wch: 12 },
      { wch: 30 },
      { wch: 35 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Company Visits');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }

  /**
   * Genera Excel per i task
   */
  generateTasksExcel(tasks: any[]): Buffer {
    const workbook = XLSX.utils.book_new();

    const data = tasks.map((task: any) => {
      let dueDateStr = 'N/A';
      try {
        if (task.due_date) {
          dueDateStr = new Date(task.due_date).toLocaleDateString('it-IT');
        }
      } catch (e) {
        dueDateStr = 'N/A';
      }
      return {
        'Title': task.title || 'N/A',
        'Status': task.status || 'N/A',
        'Due Date': dueDateStr,
        'Assigned To': task.assignedTo?.name || task.assigned_to?.name || 'N/A',
        'Client': task.client?.name || 'N/A',
        'Company': task.company?.name || task.company || 'N/A',
        'Created By': task.createdBy?.name || task.created_by?.name || 'N/A',
      };
    });

    const sheet = XLSX.utils.json_to_sheet(data);
    sheet['!cols'] = [
      { wch: 30 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Tasks');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer as Buffer;
  }
}
