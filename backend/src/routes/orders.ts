import { Router, Request, Response } from 'express';
import { OrderService, CreateOrderRequest, UpdateOrderRequest, CreateOrderItemRequest, UpdateOrderItemRequest } from '../services/OrderService';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const orderService = new OrderService();
const pdfService = new PdfService();
const excelService = new ExcelService();

// Proteggi tutte le route con autenticazione
router.use(authMiddleware);

/**
 * POST /api/orders
 * Crea un nuovo ordine
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateOrderRequest = req.body;
    const order = await orderService.createOrder(data);
    const response: ApiResponse<any> = { success: true, data: order };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/orders/export-pdf
 * Export filtered orders list to PDF
 */
router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const { client_id, status, startDate, endDate } = req.body;
    const filters: any = {};
    if (client_id) filters.client_id = client_id;
    if (status) filters.status = status;
    let orders = await orderService.getOrders(filters);
    if (startDate) orders = orders.filter((o: any) => new Date(o.order_date || o.created_at) >= new Date(startDate));
    if (endDate) orders = orders.filter((o: any) => new Date(o.order_date || o.created_at) <= new Date(endDate));
    const buffer = await pdfService.generateFilteredOrdersPdf(orders, { title: 'Orders Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/orders/export-excel
 * Export filtered orders list to Excel
 */
router.post('/export-excel', async (req: Request, res: Response) => {
  try {
    const { client_id, status, startDate, endDate } = req.body;
    const filters: any = {};
    if (client_id) filters.client_id = client_id;
    if (status) filters.status = status;
    let orders = await orderService.getOrders(filters);
    if (startDate) orders = orders.filter((o: any) => new Date(o.order_date || o.created_at) >= new Date(startDate));
    if (endDate) orders = orders.filter((o: any) => new Date(o.order_date || o.created_at) <= new Date(endDate));
    const buffer = excelService.generateFilteredOrdersExcel(orders);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/orders
 * Recupera ordini con filtri opzionali (visit_id, client_id, status)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      visit_id: req.query.visit_id as string,
      client_id: req.query.client_id as string,
      status: req.query.status as any,
    };
    const orders = await orderService.getOrders(filters);
    const response: ApiResponse<any> = { success: true, data: orders };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * SPECIFIC ROUTES (deve stare prima di /:id)
 */

/**
 * GET /api/orders/visit/:visitId/stats
 * Recupera statistiche ordini di una visita
 */
router.get('/visit/:visitId/stats', async (req: Request, res: Response) => {
  try {
    const stats = await orderService.getOrdersStats(req.params.visitId);
    const response: ApiResponse<any> = { success: true, data: stats };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/orders/visit/:visitId/export-pdf
 * Esporta tutti gli ordini di una visita in PDF
 */
router.get('/visit/:visitId/export-pdf', async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getOrdersByVisit(req.params.visitId);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'No orders found for this visit' });
    }

    const pdfBuffer = await pdfService.generateOrdersPdf(orders, {
      title: `Ordini Visita: ${orders[0].client_name}`,
      generatedAt: new Date(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ordini_visita_${req.params.visitId.substring(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[ORDERS] Error exporting visit PDF:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/orders/visit/:visitId/export-excel
 * Esporta tutti gli ordini di una visita in Excel
 */
router.get('/visit/:visitId/export-excel', async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getOrdersByVisit(req.params.visitId);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'No orders found for this visit' });
    }

    const visit = orders[0].visit;
    const visitDate = visit?.visit_date instanceof Date
      ? visit.visit_date.toISOString()
      : (typeof visit?.visit_date === 'string' ? visit.visit_date : new Date().toISOString());
    const excelBuffer = excelService.generateVisitOrdersExcel({
      visit_date: visitDate,
      client_name: orders[0].client_name,
      orders: orders,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ordini_visita_${req.params.visitId.substring(0, 8)}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GENERIC ROUTES (meno specifiche vanno dopo)
 */

/**
 * GET /api/orders/:id
 * Recupera un ordine specifico con dettagli
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    const response: ApiResponse<any> = { success: true, data: order };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/orders/:id/export-pdf
 * Esporta un singolo ordine in PDF
 */
router.get('/:id/export-pdf', async (req: Request, res: Response) => {
  try {
    console.log(`[ORDERS] Exporting order ${req.params.id} to PDF`);
    const order = await orderService.getOrderById(req.params.id);
    if (!order) {
      console.log(`[ORDERS] Order not found: ${req.params.id}`);
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    console.log(`[ORDERS] Generating PDF for order:`, order.id);
    const pdfBuffer = await pdfService.generateOrderPdf(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ordine_${order.id.substring(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[ORDERS] Error exporting order PDF:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/orders/:id/export-excel
 * Esporta un singolo ordine in Excel
 */
router.get('/:id/export-excel', async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const excelBuffer = excelService.generateOrderExcel(order);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ordine_${order.id.substring(0, 8)}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/orders/:id/items
 * Aggiungi una nuova riga all'ordine
 */
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const itemData: CreateOrderItemRequest = req.body;
    console.log(`[ORDER] Adding item to order ${req.params.id}:`, itemData);
    const item = await orderService.addOrderItem(req.params.id, itemData);
    console.log(`[ORDER] Item added successfully:`, item);
    const response: ApiResponse<any> = { success: true, data: item };
    res.status(201).json(response);
  } catch (error) {
    console.error(`[ORDER] Error adding item:`, error);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/orders/:orderId/items/:itemId
 * Aggiorna una riga dell'ordine
 */
router.put('/:orderId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const data: UpdateOrderItemRequest = req.body;
    const item = await orderService.updateOrderItem(req.params.itemId, data);
    const response: ApiResponse<any> = { success: true, data: item };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/orders/:orderId/items/:itemId
 * Elimina una riga dell'ordine
 */
router.delete('/:orderId/items/:itemId', async (req: Request, res: Response) => {
  try {
    await orderService.deleteOrderItem(req.params.itemId);
    const response: ApiResponse<any> = { success: true, message: 'Order item deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/orders/:id
 * Aggiorna intestazione ordine (data, pagamento, note, status)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateOrderRequest = req.body;
    const order = await orderService.updateOrder(req.params.id, data);
    const response: ApiResponse<any> = { success: true, data: order };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/orders/:id
 * Elimina un ordine (e tutte le sue righe per cascata)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await orderService.deleteOrder(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Order deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
