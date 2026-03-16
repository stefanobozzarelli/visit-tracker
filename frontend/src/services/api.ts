import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '../types';
import { config } from '../config';
import { offlineDB } from './offlineDB';
import { syncEngine } from './syncEngine';

const API_BASE_URL = config.API_BASE_URL;

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    // Request interceptor - add auth token
    this.api.interceptors.request.use(
      (config) => {
        console.log(`[Request] ${config.method?.toUpperCase()} ${config.url} - Online: ${navigator.onLine}`);
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - cache GET requests and handle offline
    this.api.interceptors.response.use(
      (response) => {
        console.log(`[Interceptor] Response received: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
        // Cache successful GET requests
        if (response.config.method === 'get' && response.status === 200) {
          console.log(`[Cache] Caching response: ${response.config.url}`, response.data);
          this.cacheResponse(response.config.url || '', response.data);
        }
        return response;
      },
      async (error: AxiosError) => {
        console.log(`[Error Handler] Offline: ${!navigator.onLine}, Method: ${error.config?.method}, URL: ${error.config?.url}`);

        // If offline and GET request, try to get from cache
        if (!navigator.onLine && error.config?.method === 'get') {
          console.log(`[Offline] Attempting to fetch from cache for: ${error.config.url}`);
          const cachedData = await this.getCachedResponse(error.config.url || '');
          if (cachedData) {
            console.log(`[Offline] ✅ Serving from cache: ${error.config.url}`);

            // Wrap cached data in API response format
            const responseData = Array.isArray(cachedData)
              ? { success: true, data: cachedData }
              : cachedData;

            return Promise.resolve({
              ...error.response,
              data: responseData,
              status: 200,
              statusText: 'OK (from cache)',
            } as any);
          } else {
            console.log(`[Offline] ❌ No cache found for: ${error.config.url}`);
          }
        }

        // If offline and POST/PUT/DELETE, handle optimistic update
        if (!navigator.onLine && ['post', 'put', 'delete'].includes(error.config?.method || '')) {
          const method = error.config?.method?.toUpperCase() || 'POST';
          const url = error.config?.url || '';
          const data = error.config?.data;

          console.log(`[Offline] Handling ${method} request optimistically: ${url}`);

          // Queue the request for later sync
          await offlineDB.addToSyncQueue(method, url, data, error.config?.headers);

          // For POST requests, generate temporary ID and store data
          if (method === 'POST') {
            const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const storeName = this.extractStoreNameFromUrl(url);

            if (storeName && data) {
              // Parse data if it's a string
              const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
              const optimisticItem = {
                ...parsedData,
                id: tempId,
                sync_status: 'pending',
                last_modified: Date.now(),
                version: 1,
                timestamp: Date.now(),
              };

              // Save to offlineDB for offline access
              await this.saveOptimisticData(storeName, optimisticItem);
              console.log(`[Offline] Saved optimistic data with temp ID: ${tempId}`);

              // Return optimistic response with temporary ID
              return Promise.resolve({
                data: { success: true, data: optimisticItem },
                status: 201,
                statusText: 'Created (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          // For PUT/DELETE requests, return optimistic response
          if (method === 'PUT') {
            const storeName = this.extractStoreNameFromUrl(url);
            const idMatch = url.match(/\/([a-f0-9-]+)(?:\/|$)/);
            if (storeName && idMatch && data) {
              const id = idMatch[1];
              const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
              const optimisticItem = {
                ...parsedData,
                id,
                sync_status: 'pending',
                last_modified: Date.now(),
                timestamp: Date.now(),
              };

              await this.saveOptimisticData(storeName, optimisticItem);
              console.log(`[Offline] Marked ${id} as pending update`);

              return Promise.resolve({
                data: { success: true, data: optimisticItem },
                status: 200,
                statusText: 'Updated (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          if (method === 'DELETE') {
            const storeName = this.extractStoreNameFromUrl(url);
            const idMatch = url.match(/\/([a-f0-9-]+)(?:\/|$)/);
            if (storeName && idMatch) {
              const id = idMatch[1];
              await offlineDB.updateSyncStatus(storeName, id, 'pending');
              console.log(`[Offline] Marked ${id} as pending deletion`);

              return Promise.resolve({
                data: { success: true, message: 'Deletion queued' },
                status: 200,
                statusText: 'Deleted (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          // Fallback response
          return Promise.resolve({
            data: { success: true, message: 'Request queued for sync' },
            status: 202,
            statusText: 'Accepted (queued)',
            headers: {},
            config: error.config || {},
          } as any);
        }

        return Promise.reject(error);
      }
    );
  }

  private async cacheResponse(url: string, data: any): Promise<void> {
    try {
      // Extract store name from URL (e.g., /visits -> visits, /clients -> clients)
      // Handle admin endpoints specially
      let storeName = null;
      if (url.includes('/admin/users')) {
        storeName = 'users';
      } else if (url.includes('/admin/permissions')) {
        storeName = 'permissions';
      } else if (url.includes('/admin/reports')) {
        storeName = 'reports';
      } else {
        // Get the last path segment that's a valid store name
        const parts = url.split('/').filter(p => p.length > 0);
        // Look for a valid store name in the URL parts
        const validStoresSet = new Set([
          'users',
          'clients',
          'companies',
          'visits',
          'reports',
          'attachments',
          'permissions',
          'todos',
          'orders',
        ]);

        for (let i = parts.length - 1; i >= 0; i--) {
          if (validStoresSet.has(parts[i])) {
            storeName = parts[i];
            break;
          }
        }
      }

      if (!storeName) {
        console.warn(`[Cache] Could not extract store name from URL: ${url}`);
        return;
      }

      const validStores = [
        'users',
        'clients',
        'companies',
        'visits',
        'reports',
        'attachments',
        'permissions',
        'todos',
        'orders',
      ];

      if (validStores.includes(storeName)) {
        // If data is an array, save it; if it's an object with data array, extract it
        const dataToCache = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : [data];
        console.log(`[Cache] Saving ${dataToCache.length} items to store: ${storeName}`);
        await offlineDB.saveData(storeName, dataToCache);
        console.log(`[Cache] Successfully saved to ${storeName}`);
      } else {
        console.warn(`[Cache] Store name not valid: ${storeName}`);
      }
    } catch (error) {
      console.warn('Failed to cache response:', error);
    }
  }

  private async getCachedResponse(url: string): Promise<any | null> {
    try {
      // Handle admin endpoints specially
      let storeName = null;
      if (url.includes('/admin/users')) {
        storeName = 'users';
      } else if (url.includes('/admin/permissions')) {
        storeName = 'permissions';
      } else if (url.includes('/admin/reports')) {
        storeName = 'reports';
      } else {
        const match = url.match(/\/([a-zA-Z]+)(?:\/|$)/);
        if (!match) {
          console.warn(`[Cache] Could not extract store name for reading: ${url}`);
          return null;
        }
        storeName = match[1];
      }

      const validStores = [
        'users',
        'clients',
        'companies',
        'visits',
        'reports',
        'attachments',
        'permissions',
        'todos',
      ];

      if (!validStores.includes(storeName)) {
        console.warn(`[Cache] Store name not valid for reading: ${storeName}`);
        return null;
      }

      const cachedData = await offlineDB.getData(storeName);
      console.log(`[Cache] Retrieved ${cachedData.length} items from ${storeName}`);

      if (cachedData.length === 0) {
        console.warn(`[Cache] No data cached for ${storeName}`);
        return null;
      }

      // If URL ends with an ID, find that specific item
      const idMatch = url.match(/\/([a-f0-9-]+)$/);
      if (idMatch) {
        const id = idMatch[1];
        const item = cachedData.find((item) => item.id === id);
        console.log(`[Cache] Found item with ID ${id}: ${item ? 'yes' : 'no'}`);
        return item || null;
      }

      // Return all cached data
      return cachedData;
    } catch (error) {
      console.warn('Failed to retrieve cached response:', error);
      return null;
    }
  }

  private extractStoreNameFromUrl(url: string): string | null {
    // Handle admin endpoints specially
    if (url.includes('/admin/users')) return 'users';
    if (url.includes('/admin/permissions')) return 'permissions';
    if (url.includes('/admin/reports')) return 'reports';

    const match = url.match(/\/([a-zA-Z]+)(?:\/|$)/);
    if (!match) return null;

    const storeName = match[1];
    const validStores = [
      'users',
      'clients',
      'companies',
      'visits',
      'reports',
      'attachments',
      'permissions',
      'todos',
      'orders',
    ];

    return validStores.includes(storeName) ? storeName : null;
  }

  private async saveOptimisticData(storeName: string, item: any): Promise<void> {
    try {
      const validStores = [
        'users',
        'clients',
        'companies',
        'visits',
        'reports',
        'attachments',
        'permissions',
        'todos',
        'orders',
      ];

      // For admin/users endpoint, save to users store
      if (storeName === 'admin') {
        storeName = 'users';
      }

      if (validStores.includes(storeName)) {
        const existing = await offlineDB.getData(storeName);
        const index = existing.findIndex((x) => x.id === item.id);

        if (index >= 0) {
          existing[index] = item;
        } else {
          existing.push(item);
        }

        await offlineDB.saveData(storeName, existing);
      }
    } catch (error) {
      console.warn('Failed to save optimistic data:', error);
    }
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

  // Users Management
  async createUser(email: string, name: string, password: string, role: string = 'sales_rep', company_id?: string) {
    const response = await this.api.post<ApiResponse<any>>('/admin/users', {
      email,
      name,
      password,
      role,
      company_id,
    });
    return response.data;
  }

  async getUsers(filters?: { role?: string; company_id?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/admin/users', { params: filters });
    return response.data;
  }

  async getUserById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/admin/users/${id}`);
    return response.data;
  }

  async updateUser(id: string, data: { name?: string; email?: string; role?: string; company_id?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/admin/users/${id}`, data);
    return response.data;
  }

  async changeUserPassword(id: string, newPassword: string) {
    const response = await this.api.patch<ApiResponse<any>>(`/admin/users/${id}/password`, { newPassword });
    return response.data;
  }

  async deleteUser(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/admin/users/${id}`);
    return response.data;
  }
}

export const apiService = new ApiService();
