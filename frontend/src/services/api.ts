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
      timeout: 8000, // 8 second timeout - makes requests fail fast when WiFi is off
    });

    // Request interceptor - add auth token and short-circuit when offline
    this.api.interceptors.request.use(
      (config) => {
        console.log(`[Request] ${config.method?.toUpperCase()} ${config.url} - Online: ${navigator.onLine}`);
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // If browser reports offline, use a very short timeout so the error
        // interceptor fires quickly and can serve from cache
        if (!navigator.onLine) {
          config.timeout = 1; // Fail almost immediately
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - cache GET requests and handle offline
    this.api.interceptors.response.use(
      (response) => {
        // Cache successful GET requests (200 and 304)
        if (response.config.method === 'get' && (response.status === 200 || response.status === 304)) {
          const url = response.config.url || '';
          if (this.shouldCacheUrl(url)) {
            this.cacheResponse(url, response.data, response.config.params);
          }
        }
        return response;
      },
      async (error: AxiosError) => {
        // Detect network error: no response at all = server unreachable (offline or server down)
        // Be broad: ANY request that has no response means we couldn't reach the server
        const isNetworkError = !error.response;
        const isOffline = isNetworkError || !navigator.onLine;

        // --- OFFLINE GET: serve from IndexedDB cache ---
        if (isOffline && error.config?.method === 'get') {
          const url = error.config.url || '';
          const params = error.config.params;
          try {
            const cachedData = await this.getCachedResponse(url, params);
            if (cachedData !== null) {
              return Promise.resolve({
                data: { success: true, data: cachedData },
                status: 200,
                statusText: 'OK (from cache)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          } catch (cacheErr) {
            console.warn('[Offline] Cache lookup failed:', cacheErr);
          }
          // No cache found - return empty success for lists, reject for single items
          const cleanUrl = url.split('?')[0];
          const isSingleItem = /\/[a-f0-9-]{8,}$/.test(cleanUrl);
          if (!isSingleItem) {
            return Promise.resolve({
              data: { success: true, data: [] },
              status: 200,
              statusText: 'OK (empty cache)',
              headers: {},
              config: error.config || {},
            } as any);
          }
        }

        // --- OFFLINE POST/PUT/DELETE: optimistic updates ---
        // SKIP auth endpoints - they must fail so AuthContext can try offline auth
        const requestUrl = error.config?.url || '';
        if (isOffline && ['post', 'put', 'delete'].includes(error.config?.method || '') && !requestUrl.includes('/auth/')) {
          const method = error.config?.method?.toUpperCase() || 'POST';
          // Build the FULL URL (baseURL + url) so the sync engine sends to the right server
          const relativeUrl = error.config?.url || '';
          const baseUrl = error.config?.baseURL || '';
          const url = relativeUrl.startsWith('http') ? relativeUrl : baseUrl + relativeUrl;
          const data = error.config?.data;

          // Parse data if it's a serialized JSON string (axios transforms it)
          let parsedData = data;
          if (typeof data === 'string') {
            try { parsedData = JSON.parse(data); } catch { parsedData = data; }
          }

          // Queue for sync (non-blocking)
          try {
            await offlineDB.addToSyncQueue(method, url, parsedData, {
              'Content-Type': 'application/json',
            });
          } catch (syncError) {
            console.warn('[Offline] Failed to queue for sync:', syncError);
          }

          // POST: generate temp ID and store optimistically
          if (method === 'POST') {
            const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const storeName = this.getStoreNameFromUrl(url);

            if (storeName && parsedData) {
              const optimisticItem = {
                ...parsedData,
                id: tempId,
                name: parsedData.name || '',
                sync_status: 'pending',
                last_modified: Date.now(),
                version: 1,
                timestamp: Date.now(),
              };

              try {
                await offlineDB.upsertData(storeName, optimisticItem);
              } catch (e) { /* non-critical */ }

              return Promise.resolve({
                data: { success: true, data: optimisticItem },
                status: 201,
                statusText: 'Created (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          // PUT: update existing record optimistically
          if (method === 'PUT') {
            const storeName = this.getStoreNameFromUrl(url);
            const cleanUrl = url.split('?')[0];
            const idMatch = cleanUrl.match(/\/([a-f0-9-]{8,})(?:\/|$)/);
            if (storeName && idMatch && parsedData) {
              const id = idMatch[1];
              const optimisticItem = {
                ...parsedData,
                id,
                sync_status: 'pending',
                last_modified: Date.now(),
                timestamp: Date.now(),
              };

              try {
                await offlineDB.upsertData(storeName, optimisticItem);
              } catch (e) { /* non-critical */ }

              return Promise.resolve({
                data: { success: true, data: optimisticItem },
                status: 200,
                statusText: 'Updated (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          // DELETE: mark as pending deletion
          if (method === 'DELETE') {
            const storeName = this.getStoreNameFromUrl(url);
            const cleanUrl = url.split('?')[0];
            const idMatch = cleanUrl.match(/\/([a-f0-9-]{8,})(?:\/|$)/);
            if (storeName && idMatch) {
              try {
                await offlineDB.updateSyncStatus(storeName, idMatch[1], 'pending');
              } catch (e) { /* non-critical */ }

              return Promise.resolve({
                data: { success: true, message: 'Deletion queued' },
                status: 200,
                statusText: 'Deleted (offline)',
                headers: {},
                config: error.config || {},
              } as any);
            }
          }

          // Fallback for any offline write
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

  // ---- Store name extraction ----
  private static readonly VALID_STORES = new Set([
    'users', 'clients', 'companies', 'visits', 'reports',
    'attachments', 'permissions', 'todos', 'orders',
  ]);

  private getStoreNameFromUrl(url: string): string | null {
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.includes('/admin/users')) return 'users';
    if (cleanUrl.includes('/admin/permissions')) return 'permissions';
    if (cleanUrl.includes('/admin/reports')) return 'reports';

    const parts = cleanUrl.split('/').filter(p => p.length > 0);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (ApiService.VALID_STORES.has(parts[i])) return parts[i];
    }
    return null;
  }

  // ---- Determine if a URL should be cached ----
  // Only cache entity list and detail endpoints, NOT sub-resource actions
  // e.g. YES: /clients, /visits/uuid   NO: /visits/uuid/can-delete, /orders/uuid/export-pdf
  private shouldCacheUrl(url: string): boolean {
    const cleanUrl = url.split('?')[0];
    const storeName = this.getStoreNameFromUrl(url);
    if (!storeName) return false;

    // Find the store name position in the URL
    const storePos = cleanUrl.lastIndexOf('/' + storeName);
    if (storePos === -1) return false;

    // Get everything after the store name
    const afterStore = cleanUrl.substring(storePos + storeName.length + 1);

    // Allow: empty (list), /uuid (detail), /my (todos/my)
    if (afterStore === '' || afterStore === '/') return true;
    if (/^\/[a-f0-9-]{8,}$/.test(afterStore)) return true;
    if (afterStore === '/my') return true;

    return false;
  }

  // ---- Cache a GET response into IndexedDB ----
  private async cacheResponse(url: string, data: any, params?: Record<string, any>): Promise<void> {
    try {
      const storeName = this.getStoreNameFromUrl(url);
      if (!storeName) return;

      // Extract actual data from API response envelope { success, data }
      const actualData = data?.data !== undefined ? data.data : data;
      if (actualData === null || actualData === undefined) return;

      const cleanUrl = url.split('?')[0];
      const isSingleItem = /\/[a-f0-9-]{8,}$/.test(cleanUrl);

      if (isSingleItem && !Array.isArray(actualData)) {
        // Single item → upsert (do NOT clear store)
        if (typeof actualData === 'object' && actualData.id) {
          await offlineDB.upsertData(storeName, actualData);
        }
      } else if (params && Object.keys(params).length > 0) {
        // Filtered query (e.g. /orders?visit_id=xxx) → upsert each item (do NOT clear store)
        const items = Array.isArray(actualData) ? actualData : [actualData];
        const validItems = items.filter((item: any) => item && typeof item === 'object' && item.id);
        if (validItems.length > 0) {
          await offlineDB.upsertBatch(storeName, validItems);
        }
      } else {
        // Unfiltered list → replace entire store
        const items = Array.isArray(actualData) ? actualData : [actualData];
        await offlineDB.saveData(storeName, items);
      }
    } catch (error) {
      console.warn('[Cache] Failed to cache response:', error);
    }
  }

  // ---- Retrieve cached data from IndexedDB ----
  private async getCachedResponse(url: string, params?: Record<string, any>): Promise<any | null> {
    try {
      const storeName = this.getStoreNameFromUrl(url);
      if (!storeName) return null;

      const cachedData = await offlineDB.getData(storeName);
      if (!cachedData || cachedData.length === 0) return null;

      // Single item by UUID at end of URL
      const cleanUrl = url.split('?')[0];
      const idMatch = cleanUrl.match(/\/([a-f0-9-]{8,})$/);
      if (idMatch) {
        return cachedData.find((item: any) => item.id === idMatch[1]) || null;
      }

      // Filtered query via params
      if (params && Object.keys(params).length > 0) {
        let filtered = cachedData;
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            filtered = filtered.filter((item: any) => String(item[key]) === String(value));
          }
        }
        return filtered;
      }

      return cachedData;
    } catch (error) {
      console.warn('[Cache] Failed to retrieve cached response:', error);
      return null;
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
