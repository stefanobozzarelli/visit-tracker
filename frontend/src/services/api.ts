import axios, { AxiosInstance } from 'axios';
import { ApiResponse } from '../types';
import { config } from '../config';

const API_BASE_URL = config.API_BASE_URL;

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // Auth
  async register(email: string, name: string, password: string, role: string = 'sales_rep') {
    const response = await this.api.post<ApiResponse<any>>('/auth/register', {
      email,
      name,
      password,
      role,
    });
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await this.api.post<ApiResponse<any>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  }

  // Clients
  async createClient(name: string, country: string, notes?: string, role?: string) {
    const response = await this.api.post<ApiResponse<any>>('/clients', {
      name,
      country,
      notes,
      role,
    });
    return response.data;
  }

  async getClients() {
    const response = await this.api.get<ApiResponse<any>>('/clients');
    return response.data;
  }

  async getClient(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/clients/${id}`);
    return response.data;
  }

  async updateClient(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/clients/${id}`, data);
    return response.data;
  }

  async deleteClient(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/clients/${id}`);
    return response.data;
  }

  async addClientContact(clientId: string, name: string, role?: string, email?: string, phone?: string) {
    const response = await this.api.post<ApiResponse<any>>(`/clients/${clientId}/contacts`, {
      name,
      role,
      email,
      phone,
    });
    return response.data;
  }

  async getClientContacts(clientId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/clients/${clientId}/contacts`);
    return response.data;
  }

  // Companies
  async createCompany(name: string, country: string, industry?: string) {
    const response = await this.api.post<ApiResponse<any>>('/companies', {
      name,
      country,
      industry,
    });
    return response.data;
  }

  async getCompanies() {
    const response = await this.api.get<ApiResponse<any>>('/companies');
    return response.data;
  }

  async getCompany(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/companies/${id}`);
    return response.data;
  }

  async updateCompany(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/companies/${id}`, data);
    return response.data;
  }

  async deleteCompany(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/companies/${id}`);
    return response.data;
  }

  // Visits
  async createVisit(clientId: string, visitDate: string, reports: any[]) {
    const response = await this.api.post<ApiResponse<any>>('/visits', {
      client_id: clientId,
      visit_date: visitDate,
      reports,
    });
    return response.data;
  }

  async getVisits(filters?: { client_id?: string; user_id?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/visits', { params: filters });
    return response.data;
  }

  async getVisit(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/visits/${id}`);
    return response.data;
  }

  async addVisitReport(visitId: string, companyId: string, section: string, content: string) {
    const response = await this.api.post<ApiResponse<any>>(`/visits/${visitId}/reports`, {
      company_id: companyId,
      section,
      content,
    });
    return response.data;
  }

  async updateVisitReport(visitId: string, reportId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(
      `/visits/${visitId}/reports/${reportId}`,
      data
    );
    return response.data;
  }

  async deleteVisitReport(visitId: string, reportId: string) {
    const response = await this.api.delete<ApiResponse<any>>(
      `/visits/${visitId}/reports/${reportId}`
    );
    return response.data;
  }

  async canDeleteVisit(visitId: string) {
    const response = await this.api.get<ApiResponse<any>>(
      `/visits/${visitId}/can-delete`
    );
    return response.data;
  }

  async deleteVisit(visitId: string) {
    const response = await this.api.delete<ApiResponse<any>>(
      `/visits/${visitId}`
    );
    return response.data;
  }

  // File Upload
  async getPresignedUrl(visitId: string, reportId: string, filename: string, fileSize: number, contentType: string = 'application/octet-stream') {
    const response = await this.api.post<ApiResponse<any>>(
      `/visits/${visitId}/reports/${reportId}/upload`,
      { filename, fileSize, contentType }
    );
    return response.data;
  }

  async getAttachmentDownloadUrl(visitId: string, reportId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(
      `/visits/${visitId}/reports/${reportId}/attachments/${attachmentId}/download`
    );
    return response.data;
  }

  async deleteAttachment(visitId: string, reportId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(
      `/visits/${visitId}/reports/${reportId}/attachments/${attachmentId}`
    );
    return response.data;
  }

  // Todos
  async createTodo(title: string, clientId: string, companyId: string, assignedToUserId: string, dueDate?: string, visitReportId?: string) {
    const response = await this.api.post<ApiResponse<any>>('/todos', {
      title,
      clientId,
      companyId,
      assignedToUserId,
      dueDate,
      visitReportId,
    });
    return response.data;
  }

  async getTodos(filters?: { status?: string; clientId?: string; companyId?: string; assignedToUserId?: string; overdue?: boolean; thisWeek?: boolean; next7Days?: boolean }) {
    const response = await this.api.get<ApiResponse<any>>('/todos', { params: filters });
    return response.data;
  }

  async getMyTodos(filters?: { status?: string; clientId?: string; companyId?: string; overdue?: boolean; thisWeek?: boolean; next7Days?: boolean }) {
    const response = await this.api.get<ApiResponse<any>>('/todos/my', { params: filters });
    return response.data;
  }

  async getTodoById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/${id}`);
    return response.data;
  }

  async updateTodo(id: string, data: { status?: string; dueDate?: string; assignedToUserId?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/todos/${id}`, data);
    return response.data;
  }

  async deleteTodo(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/todos/${id}`);
    return response.data;
  }

  // Customer Orders
  async createOrder(data: {
    visit_id: string;
    supplier_id: string;
    supplier_name: string;
    client_id: string;
    client_name: string;
    order_date: string;
    payment_method?: string;
    notes?: string;
    items?: any[];
  }) {
    const response = await this.api.post<ApiResponse<any>>('/orders', data);
    return response.data;
  }

  async getOrders(filters?: { visit_id?: string; client_id?: string; status?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/orders', { params: filters });
    return response.data;
  }

  async getOrderById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/orders/${id}`);
    return response.data;
  }

  async updateOrder(id: string, data: { order_date?: string; payment_method?: string; notes?: string; status?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/orders/${id}`, data);
    return response.data;
  }

  async deleteOrder(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/orders/${id}`);
    return response.data;
  }

  async addOrderItem(orderId: string, data: {
    article_code: string;
    description: string;
    format?: string;
    unit_of_measure: string;
    quantity: number;
    unit_price: number;
    discount?: number;
  }) {
    const response = await this.api.post<ApiResponse<any>>(`/orders/${orderId}/items`, data);
    return response.data;
  }

  async updateOrderItem(orderId: string, itemId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/orders/${orderId}/items/${itemId}`, data);
    return response.data;
  }

  async deleteOrderItem(orderId: string, itemId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/orders/${orderId}/items/${itemId}`);
    return response.data;
  }

  async getOrdersByVisit(visitId: string) {
    const response = await this.api.get<ApiResponse<any>>('/orders', { params: { visit_id: visitId } });
    return response.data;
  }

  async getOrdersStats(visitId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/orders/visit/${visitId}/stats`);
    return response.data;
  }

  // Export Orders
  async exportOrderPdf(orderId: string) {
    const response = await this.api.get(`/orders/${orderId}/export-pdf`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async exportOrderExcel(orderId: string) {
    const response = await this.api.get(`/orders/${orderId}/export-excel`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async exportVisitOrdersPdf(visitId: string) {
    const response = await this.api.get(`/orders/visit/${visitId}/export-pdf`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async exportVisitOrdersExcel(visitId: string) {
    const response = await this.api.get(`/orders/visit/${visitId}/export-excel`, {
      responseType: 'blob',
    });
    return response.data;
  }
}

export const apiService = new ApiService();
