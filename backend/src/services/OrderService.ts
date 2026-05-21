import { AppDataSource } from '../config/database';
import { CustomerOrder, OrderStatus } from '../entities/CustomerOrder';
import { CustomerOrderItem } from '../entities/CustomerOrderItem';
import { Visit } from '../entities/Visit';

export interface CreateOrderRequest {
  visit_id: string;
  supplier_id: string;
  supplier_name: string;
  client_id: string;
  client_name: string;
  order_date: string; // YYYY-MM-DD
  payment_method?: string;
  notes?: string;
  items?: CreateOrderItemRequest[];
}

export interface CreateOrderItemRequest {
  article_code: string;
  description: string;
  format?: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  discount?: string;
}

export interface UpdateOrderRequest {
  order_date?: string;
  payment_method?: string;
  notes?: string;
  status?: OrderStatus;
}

export interface UpdateOrderItemRequest {
  article_code?: string;
  description?: string;
  format?: string;
  unit_of_measure?: string;
  quantity?: number;
  unit_price?: number;
  discount?: string;
}

export class OrderService {
  private orderRepository = AppDataSource.getRepository(CustomerOrder);
  private itemRepository = AppDataSource.getRepository(CustomerOrderItem);
  private visitRepository = AppDataSource.getRepository(Visit);

  /**
   * Crea un nuovo ordine con eventuali line items
   */
  async createOrder(data: CreateOrderRequest): Promise<CustomerOrder> {
    const order = this.orderRepository.create({
      visit_id: data.visit_id,
      supplier_id: data.supplier_id,
      supplier_name: data.supplier_name,
      client_id: data.client_id,
      client_name: data.client_name,
      order_date: new Date(data.order_date),
      payment_method: data.payment_method,
      notes: data.notes,
      status: OrderStatus.DRAFT,
      total_amount: 0,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Aggiungi line items se presenti
    if (data.items && data.items.length > 0) {
      for (const itemData of data.items) {
        await this.addOrderItem(savedOrder.id, itemData);
      }
    }

    // Ricalcola totale
    await this.calculateOrderTotals(savedOrder.id);

    return this.getOrderById(savedOrder.id) as Promise<CustomerOrder>;
  }

  /**
   * Recupera tutti gli ordini (con filtri opzionali)
   */
  async getOrders(filters?: { visit_id?: string; client_id?: string; status?: OrderStatus }): Promise<CustomerOrder[]> {
    let query = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.visit', 'visit')
      .leftJoinAndSelect('order.supplier', 'supplier')
      .leftJoinAndSelect('order.client', 'client')
      .leftJoinAndSelect('order.items', 'items');

    if (filters?.visit_id) {
      query = query.where('order.visit_id = :visit_id', { visit_id: filters.visit_id });
    }
    if (filters?.client_id) {
      query = query.andWhere('order.client_id = :client_id', { client_id: filters.client_id });
    }
    if (filters?.status) {
      query = query.andWhere('order.status = :status', { status: filters.status });
    }

    return await query
      .orderBy('order.created_at', 'DESC')
      .addOrderBy('items.sort_order', 'ASC')
      .addOrderBy('items.created_at', 'ASC')
      .getMany();
  }

  /**
   * Recupera un singolo ordine con tutte le relazioni
   */
  async getOrderById(id: string): Promise<CustomerOrder | null> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['visit', 'supplier', 'client', 'items'],
    });
    if (order?.items) {
      order.items.sort((a, b) => (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : 1));
    }
    return order;
  }

  /**
   * Recupera tutti gli ordini di una visita
   */
  async getOrdersByVisit(visitId: string): Promise<CustomerOrder[]> {
    return await this.getOrders({ visit_id: visitId });
  }

  /**
   * Recupera gli ordini per più visite in una sola query.
   * Restituisce una mappa { visitId → orders[] }.
   */
  async getOrdersByVisitIds(visitIds: string[]): Promise<Map<string, CustomerOrder[]>> {
    if (visitIds.length === 0) return new Map();
    const orders = await this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.supplier', 'supplier')
      .where('order.visit_id IN (:...visitIds)', { visitIds })
      .orderBy('order.created_at', 'ASC')
      .addOrderBy('items.sort_order', 'ASC')
      .getMany();

    const map = new Map<string, CustomerOrder[]>();
    for (const order of orders) {
      const list = map.get(order.visit_id) || [];
      list.push(order);
      map.set(order.visit_id, list);
    }
    return map;
  }

  /**
   * Aggiorna intestazione ordine
   */
  async updateOrder(orderId: string, data: UpdateOrderRequest): Promise<CustomerOrder> {
    const updateData: any = {};
    if (data.order_date) updateData.order_date = new Date(data.order_date);
    if (data.payment_method) updateData.payment_method = data.payment_method;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status) updateData.status = data.status;

    await this.orderRepository.update(orderId, updateData);

    const updated = await this.getOrderById(orderId);
    if (!updated) throw new Error('Order not found');
    return updated;
  }

  /**
   * Aggiungi una nuova riga ordine
   */
  async addOrderItem(orderId: string, data: CreateOrderItemRequest): Promise<CustomerOrderItem> {
    // Assign sort_order as the next position in the order
    const existingCount = await this.itemRepository.count({ where: { order_id: orderId } });

    const item = this.itemRepository.create({
      order_id: orderId,
      article_code: data.article_code,
      description: data.description,
      format: data.format,
      unit_of_measure: data.unit_of_measure,
      quantity: data.quantity,
      unit_price: data.unit_price,
      discount: data.discount || null,
      sort_order: existingCount,
    });

    const savedItem = await this.itemRepository.save(item);

    // Ricalcola totali ordine
    await this.calculateOrderTotals(orderId);

    return savedItem;
  }

  /**
   * Aggiorna una riga ordine
   */
  async updateOrderItem(itemId: string, data: UpdateOrderItemRequest): Promise<CustomerOrderItem> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new Error('Order item not found');

    const updateData: any = {};
    if (data.article_code) updateData.article_code = data.article_code;
    if (data.description) updateData.description = data.description;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.unit_of_measure) updateData.unit_of_measure = data.unit_of_measure;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.unit_price !== undefined) updateData.unit_price = data.unit_price;
    if (data.discount !== undefined) {
      updateData.discount = data.discount || null;
    }

    await this.itemRepository.update(itemId, updateData);

    // Ricalcola totali ordine
    await this.calculateOrderTotals(item.order_id);

    const updated = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!updated) throw new Error('Order item not found after update');
    return updated;
  }

  /**
   * Elimina una riga ordine
   */
  async deleteOrderItem(itemId: string): Promise<void> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new Error('Order item not found');

    await this.itemRepository.delete(itemId);

    // Ricalcola totali ordine
    await this.calculateOrderTotals(item.order_id);
  }

  /**
   * Aggiorna il sort_order di più righe in una sola transazione.
   * Accetta un array di { id, sort_order } e li applica tutti.
   */
  async updateItemSortOrders(updates: { id: string; sort_order: number }[]): Promise<void> {
    await Promise.all(
      updates.map(({ id, sort_order }) =>
        this.itemRepository.update(id, { sort_order }),
      ),
    );
  }

  /**
   * Elimina un ordine (cancella per cascata anche le righe)
   */
  async deleteOrder(orderId: string): Promise<void> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    await this.orderRepository.delete(orderId);
  }

  /**
   * Calcola e aggiorna i totali dell'ordine
   * Total = SUM(quantity * unit_price) per ogni riga
   * (Il discount è solo un campo testuale libero, non utilizzato nel calcolo)
   */
  async calculateOrderTotals(orderId: string): Promise<void> {
    const items = await this.itemRepository.find({ where: { order_id: orderId } });

    let totalAmount = 0;
    items.forEach(item => {
      const lineTotal = item.quantity * item.unit_price;
      totalAmount += lineTotal;
    });

    await this.orderRepository.update(orderId, {
      total_amount: Math.max(0, totalAmount),
    });
  }

  /**
   * Ottieni ordini di una visita con statistiche
   */
  async getOrdersStats(visitId: string): Promise<{
    total_orders: number;
    total_items: number;
    total_amount: number;
  }> {
    const orders = await this.getOrdersByVisit(visitId);

    let totalItems = 0;
    let totalAmount = 0;

    orders.forEach(order => {
      totalItems += order.items?.length || 0;
      totalAmount += parseFloat(order.total_amount.toString());
    });

    return {
      total_orders: orders.length,
      total_items: totalItems,
      total_amount: totalAmount,
    };
  }
}
