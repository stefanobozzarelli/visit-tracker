import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '../types';
import { config } from '../config';
import { offlineDB } from './offlineDB';
import { syncEngine } from './syncEngine';

const API_BASE_URL = config.API_BASE_URL;

class ApiService {
  private api: AxiosInstance;

  // ---- In-memory SWR cache for instant navigation ----
  private memoryCache = new Map<string, { data: any; timestamp: number }>();
  private pendingRefreshes = new Set<string>();
  private readonly MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 min

  private getCacheKey(url: string, params?: Record<string, any>): string {
    return params && Object.keys(params).length > 0
      ? `${url}?${JSON.stringify(params)}`
      : url;
  }

  /**
   * Stale-while-revalidate GET: serves from in-memory cache instantly,
   * refreshes in background. Falls through to network on cache miss.
   */
  private async cachedGet<T = any>(url: string, options?: { params?: Record<string, any> }): Promise<{ data: T }> {
    const cacheKey = this.getCacheKey(url, options?.params);
    const cached = this.memoryCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.MEMORY_CACHE_TTL) {
      // Background refresh (fire-and-forget, deduplicated)
      if (!this.pendingRefreshes.has(cacheKey)) {
        this.pendingRefreshes.add(cacheKey);
        this.api.get<T>(url, options)
          .then(res => {
            this.memoryCache.set(cacheKey, { data: res.data, timestamp: Date.now() });
          })
          .catch(() => {})
          .finally(() => this.pendingRefreshes.delete(cacheKey));
      }
      return { data: cached.data };
    }

    // Cache miss → normal network request
    const response = await this.api.get<T>(url, options);
    this.memoryCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    return response;
  }

  /**
   * Warm memory cache from IndexedDB on app startup.
   * Gives instant renders even on cold page loads.
   */
  async warmMemoryCache(): Promise<void> {
    const storeToUrl: Record<string, string> = {
      clients: '/clients',
      companies: '/companies',
      visits: '/visits',
      todos: '/todos',
      users: '/admin/users',
    };

    const promises = Object.entries(storeToUrl).map(async ([store, url]) => {
      try {
        const data = await offlineDB.getData(store);
        if (data && data.length > 0) {
          const cacheKey = this.getCacheKey(url);
          // Only set if not already in memory (don't overwrite fresher data)
          if (!this.memoryCache.has(cacheKey)) {
            this.memoryCache.set(cacheKey, {
              data: { success: true, data },
              // Mark slightly stale so next real request triggers background refresh
              timestamp: Date.now() - (this.MEMORY_CACHE_TTL - 60000),
            });
          }
        }
      } catch { /* non-critical */ }
    });

    await Promise.all(promises);
  }

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 8000, // 8 second timeout - makes requests fail fast when WiFi is off
    });

    // Request interceptor - add auth token and handle offline
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // When browser reports offline, use an extremely short timeout so the
        // error interceptor fires near-instantly and can serve from cache.
        // We do NOT reject here because navigator.onLine is unreliable in Safari.
        // Instead we let the request fail fast via timeout.
        if (!navigator.onLine) {
          config.timeout = 1;
          // Mark the config so the error interceptor knows it was offline
          (config as any)._offlineShortCircuit = true;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - cache GET requests and handle offline
    this.api.interceptors.response.use(
      (response) => {
        if (response.config.method === 'get' && (response.status === 200 || response.status === 304)) {
          const url = response.config.url || '';

          // Populate in-memory cache (instant for SWR)
          const cacheKey = this.getCacheKey(url, response.config.params);
          this.memoryCache.set(cacheKey, { data: response.data, timestamp: Date.now() });

          // Persist to IndexedDB (for offline + cold start)
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

          // POST: generate temp ID for optimistic response AND sync queue mapping
          const tempId = method === 'POST'
            ? `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            : undefined;

          // Queue for sync (non-blocking)
          // Include _tempId so the sync engine can map temp→real ID after server responds
          try {
            const queueData = tempId ? { ...parsedData, _tempId: tempId } : parsedData;
            await offlineDB.addToSyncQueue(method, url, queueData, {
              'Content-Type': 'application/json',
            });
          } catch (syncError) {
            console.warn('[Offline] Failed to queue for sync:', syncError);
          }

          // POST: store optimistically in IndexedDB
          if (method === 'POST' && tempId) {
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

  async getMyAreas() {
    const response = await this.api.get<ApiResponse<any>>('/auth/my-areas');
    return response.data;
  }

  async getSidebarMenuOrder() {
    const response = await this.api.get<ApiResponse<string[]>>('/auth/sidebar-menu-order');
    return response.data;
  }

  async saveSidebarMenuOrder(menuOrder: string[]) {
    const response = await this.api.post<ApiResponse<string[]>>('/auth/sidebar-menu-order', { menuOrder });
    return response.data;
  }

  // Clients
  async createClient(name: string, country: string, notes?: string, role?: string, company_ids?: string[], city?: string, has_showroom?: boolean) {
    const response = await this.api.post<ApiResponse<any>>('/clients', {
      name,
      country,
      city,
      notes,
      role,
      company_ids,
      has_showroom,
    });
    return response.data;
  }

  async getClients() {
    const response = await this.cachedGet<ApiResponse<any>>('/clients');
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

  async addClientContact(clientId: string, data: { name: string; role?: string; email?: string; phone?: string; wechat?: string; notes?: string }) {
    const response = await this.api.post<ApiResponse<any>>(`/clients/${clientId}/contacts`, data);
    return response.data;
  }

  async getClientContacts(clientId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/clients/${clientId}/contacts`);
    return response.data;
  }

  async updateClientContact(contactId: string, data: { name?: string; role?: string; email?: string; phone?: string; wechat?: string; notes?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/clients/contacts/${contactId}`, data);
    return response.data;
  }

  async deleteClientContact(contactId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/clients/contacts/${contactId}`);
    return response.data;
  }

  async uploadBusinessCard(clientId: string, contactId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post(`/clients/${clientId}/contacts/${contactId}/business-card`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    this.memoryCache.clear();
    return response.data;
  }

  async downloadBusinessCard(clientId: string, contactId: string) {
    const response = await this.api.get(`/clients/${clientId}/contacts/${contactId}/business-card/download`);
    return response.data;
  }

  async deleteBusinessCard(clientId: string, contactId: string) {
    const response = await this.api.delete(`/clients/${clientId}/contacts/${contactId}/business-card`);
    this.memoryCache.clear();
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
    const response = await this.cachedGet<ApiResponse<any>>('/companies');
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
  async createVisit(clientId: string, visitDate: string, reports: any[], options?: { status?: string; preparation?: string }) {
    const response = await this.api.post<ApiResponse<any>>('/visits', {
      client_id: clientId,
      visit_date: visitDate,
      reports,
      ...(options?.status && { status: options.status }),
      ...(options?.preparation && { preparation: options.preparation }),
    });
    return response.data;
  }

  async updateVisit(visitId: string, data: { status?: string; preparation?: string | null; visit_date?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/visits/${visitId}`, data);
    return response.data;
  }

  async getVisits(filters?: { client_id?: string; user_id?: string; status?: string }) {
    const response = await this.cachedGet<ApiResponse<any>>('/visits', { params: filters });
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

  // Visit Direct Attachments
  async uploadVisitDirectAttachment(visitId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/visits/${visitId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getVisitDirectAttachments(visitId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/visits/${visitId}/attachments`);
    return response.data;
  }

  async downloadVisitDirectAttachment(visitId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/visits/${visitId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteVisitDirectAttachment(visitId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/visits/${visitId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Showrooms
  async getShowrooms(filters?: { clientId?: string; companyId?: string; status?: string; area?: string; city?: string }) {
    const response = await this.cachedGet<ApiResponse<any>>('/showrooms', { params: filters });
    return response.data;
  }
  async getShowroom(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/showrooms/${id}`);
    return response.data;
  }
  async createShowroom(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/showrooms', data);
    this.memoryCache.clear();
    return response.data;
  }
  async updateShowroom(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/showrooms/${id}`, data);
    this.memoryCache.clear();
    return response.data;
  }
  async deleteShowroom(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/showrooms/${id}`);
    this.memoryCache.clear();
    return response.data;
  }
  // Showroom Albums
  async createShowroomAlbum(showroomId: string, data: { date: string; title?: string; description?: string }) {
    const response = await this.api.post<ApiResponse<any>>(`/showrooms/${showroomId}/albums`, data);
    return response.data;
  }
  async getShowroomAlbums(showroomId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/showrooms/${showroomId}/albums`);
    return response.data;
  }
  async updateShowroomAlbum(showroomId: string, albumId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/showrooms/${showroomId}/albums/${albumId}`, data);
    return response.data;
  }
  async deleteShowroomAlbum(showroomId: string, albumId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/showrooms/${showroomId}/albums/${albumId}`);
    return response.data;
  }
  // Showroom Photos
  async uploadShowroomPhoto(showroomId: string, albumId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/showrooms/${showroomId}/albums/${albumId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }
  async downloadShowroomPhoto(showroomId: string, albumId: string, photoId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/showrooms/${showroomId}/albums/${albumId}/photos/${photoId}/download`);
    return response.data;
  }
  async deleteShowroomPhoto(showroomId: string, albumId: string, photoId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/showrooms/${showroomId}/albums/${albumId}/photos/${photoId}`);
    return response.data;
  }

  // Report File Upload
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
  async createTodo(title: string, clientId: string, companyId: string, assignedToUserId: string, dueDate?: string, visitReportId?: string, claimId?: string, visitId?: string, companyVisitId?: string, priority?: number, opportunityId?: string) {
    const response = await this.api.post<ApiResponse<any>>('/todos', {
      title,
      clientId,
      companyId,
      assignedToUserId,
      dueDate,
      visitReportId,
      claimId,
      visitId,
      companyVisitId,
      priority,
      opportunityId,
    });
    this.memoryCache.clear();
    return response.data;
  }

  async getTodos(filters?: { status?: string; clientId?: string; companyId?: string; assignedToUserId?: string; overdue?: boolean; thisWeek?: boolean; next7Days?: boolean; priority?: number; sortBy?: string }) {
    const response = await this.cachedGet<ApiResponse<any>>('/todos', { params: filters });
    return response.data;
  }

  async getMyTodos(filters?: { status?: string; clientId?: string; companyId?: string; overdue?: boolean; thisWeek?: boolean; next7Days?: boolean; priority?: number; sortBy?: string }) {
    const response = await this.cachedGet<ApiResponse<any>>('/todos/my', { params: filters });
    return response.data;
  }

  async getTodoById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/${id}`);
    return response.data;
  }

  async updateTodo(id: string, data: { title?: string; status?: string; dueDate?: string; assignedToUserId?: string; clientId?: string; companyId?: string; priority?: number }) {
    const response = await this.api.put<ApiResponse<any>>(`/todos/${id}`, data);
    this.memoryCache.clear();
    return response.data;
  }

  async deleteTodo(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/todos/${id}`);
    this.memoryCache.clear();
    return response.data;
  }

  // Todo Attachments
  async uploadTodoAttachment(todoId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/todos/${todoId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getTodoAttachments(todoId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/${todoId}/attachments`);
    return response.data;
  }

  async downloadTodoAttachment(todoId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/${todoId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteTodoAttachment(todoId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/todos/${todoId}/attachments/${attachmentId}`);
    return response.data;
  }

  async getTodosByClaimId(claimId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/by-claim/${claimId}`);
    return response.data;
  }

  // Claims
  async createClaim(data: { client_id: string; company_id: string; date: string; comments?: string; status?: string }) {
    const response = await this.api.post<ApiResponse<any>>('/claims', data);
    return response.data;
  }

  async getClaims(filters?: { client_id?: string; company_id?: string; status?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/claims', { params: filters });
    return response.data;
  }

  async getClaimById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/claims/${id}`);
    return response.data;
  }

  async updateClaim(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/claims/${id}`, data);
    return response.data;
  }

  async deleteClaim(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/claims/${id}`);
    return response.data;
  }

  async addClaimMovement(claimId: string, data: { date: string; action: string }) {
    const response = await this.api.post<ApiResponse<any>>(`/claims/${claimId}/movements`, data);
    return response.data;
  }

  async updateClaimMovement(claimId: string, movementId: string, data: { date?: string; action?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/claims/${claimId}/movements/${movementId}`, data);
    return response.data;
  }

  async deleteClaimMovement(claimId: string, movementId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/claims/${claimId}/movements/${movementId}`);
    return response.data;
  }

  async uploadClaimMovementAttachment(claimId: string, movementId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/claims/${claimId}/movements/${movementId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadClaimMovementAttachment(claimId: string, movementId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/claims/${claimId}/movements/${movementId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteClaimMovementAttachment(claimId: string, movementId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/claims/${claimId}/movements/${movementId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Company Visits
  async createCompanyVisit(data: { companyId: string; date: string; subject: string; report?: string; preparation?: string; participantsUserIds?: string[]; participantsExternal?: string; status?: string }) {
    const response = await this.api.post<ApiResponse<any>>('/company-visits', data);
    return response.data;
  }

  async getCompanyVisits(filters?: { companyId?: string; status?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/company-visits', { params: filters });
    return response.data;
  }

  async getCompanyVisitById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/company-visits/${id}`);
    return response.data;
  }

  async updateCompanyVisit(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/company-visits/${id}`, data);
    return response.data;
  }

  async deleteCompanyVisit(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/company-visits/${id}`);
    return response.data;
  }

  async uploadCompanyVisitAttachment(visitId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/company-visits/${visitId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getCompanyVisitAttachments(visitId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/company-visits/${visitId}/attachments`);
    return response.data;
  }

  async downloadCompanyVisitAttachment(visitId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/company-visits/${visitId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async previewCompanyVisitAttachment(visitId: string, attachmentId: string): Promise<string> {
    // Returns the preview URL (no content-disposition) for opening in new tab
    return `${this.api.defaults.baseURL}/company-visits/${visitId}/attachments/${attachmentId}/preview`;
  }

  async deleteCompanyVisitAttachment(visitId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/company-visits/${visitId}/attachments/${attachmentId}`);
    return response.data;
  }

  async getTodosByCompanyVisitId(companyVisitId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/todos/by-company-visit/${companyVisitId}`);
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
    this.memoryCache.clear();
    return response.data;
  }

  async getOrders(filters?: { visit_id?: string; client_id?: string; status?: string }) {
    const response = await this.cachedGet<ApiResponse<any>>('/orders', { params: filters });
    return response.data;
  }

  async getOrderById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/orders/${id}`);
    return response.data;
  }

  async updateOrder(id: string, data: { order_date?: string; payment_method?: string; notes?: string; status?: string }) {
    const response = await this.api.put<ApiResponse<any>>(`/orders/${id}`, data);
    this.memoryCache.clear();
    return response.data;
  }

  async deleteOrder(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/orders/${id}`);
    this.memoryCache.clear();
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

  // ---- Report Exports ----

  async exportVisitsPdf(filters: any = {}) {
    const response = await this.api.post('/visits/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportVisitsExcel(filters: any = {}) {
    const response = await this.api.post('/visits/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportClientsPdf(filters: any = {}) {
    const response = await this.api.post('/clients/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportClientsExcel(filters: any = {}) {
    const response = await this.api.post('/clients/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportShowroomsPdf(filters: any = {}) {
    const response = await this.api.post('/showrooms/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportShowroomsExcel(filters: any = {}) {
    const response = await this.api.post('/showrooms/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportProjectsPdf(filters: any = {}) {
    const response = await this.api.post('/projects/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportProjectsExcel(filters: any = {}) {
    const response = await this.api.post('/projects/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportClaimsPdf(filters: any = {}) {
    const response = await this.api.post('/claims/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportClaimsExcel(filters: any = {}) {
    const response = await this.api.post('/claims/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportFilteredOrdersPdf(filters: any = {}) {
    const response = await this.api.post('/orders/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportFilteredOrdersExcel(filters: any = {}) {
    const response = await this.api.post('/orders/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportCompanyVisitsPdf(filters: any = {}) {
    const response = await this.api.post('/company-visits/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportCompanyVisitsExcel(filters: any = {}) {
    const response = await this.api.post('/company-visits/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportTasksPdf(filters: any = {}) {
    const response = await this.api.post('/todos/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportTasksExcel(filters: any = {}) {
    const response = await this.api.post('/todos/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  // ---- Offers ----
  async getOffers(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.company_id) params.append('company_id', filters.company_id);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.visit_id) params.append('visit_id', filters.visit_id);
    if (filters?.project_id) params.append('project_id', filters.project_id);
    if (filters?.company_visit_id) params.append('company_visit_id', filters.company_visit_id);
    const qs = params.toString();
    const response = await this.api.get<ApiResponse<any>>(`/offers${qs ? `?${qs}` : ''}`);
    return response.data;
  }

  async getOffer(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/offers/${id}`);
    return response.data;
  }

  async createOffer(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/offers', data);
    return response.data;
  }

  async updateOffer(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/offers/${id}`, data);
    return response.data;
  }

  async deleteOffer(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/offers/${id}`);
    return response.data;
  }

  // Offer Items
  async addOfferItem(offerId: string, data: any) {
    const response = await this.api.post<ApiResponse<any>>(`/offers/${offerId}/items`, data);
    return response.data;
  }

  async updateOfferItem(offerId: string, itemId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/offers/${offerId}/items/${itemId}`, data);
    return response.data;
  }

  async deleteOfferItem(offerId: string, itemId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/offers/${offerId}/items/${itemId}`);
    return response.data;
  }

  // Offer Attachments
  async uploadOfferAttachment(offerId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/offers/${offerId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadOfferAttachment(offerId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/offers/${offerId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteOfferAttachment(offerId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/offers/${offerId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Offer Item Attachments
  async uploadOfferItemAttachment(offerId: string, itemId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/offers/${offerId}/items/${itemId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadOfferItemAttachment(offerId: string, itemId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/offers/${offerId}/items/${itemId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteOfferItemAttachment(offerId: string, itemId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/offers/${offerId}/items/${itemId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Offer Exports
  async exportOffersPdf(filters: any = {}) {
    const response = await this.api.post('/offers/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportOffersExcel(filters: any = {}) {
    const response = await this.api.post('/offers/export-excel', filters, { responseType: 'blob' });
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
    const response = await this.cachedGet<ApiResponse<any>>('/admin/users', { params: filters });
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

  async toggleRevenueAccess(userId: string, canViewRevenue: boolean) {
    const response = await this.api.put<ApiResponse<any>>(`/admin/users/${userId}/revenue-access`, { can_view_revenue: canViewRevenue });
    return response.data;
  }

  async deleteUser(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/admin/users/${id}`);
    return response.data;
  }

  // ---- Profile (self-service) ----
  async getProfile() {
    const response = await this.api.get<ApiResponse<any>>('/auth/me');
    return response.data;
  }

  async updateProfile(data: { name: string }) {
    const response = await this.api.put<ApiResponse<any>>('/auth/profile', data);
    return response.data;
  }

  async changeMyPassword(currentPassword: string, newPassword: string) {
    const response = await this.api.patch<ApiResponse<any>>('/auth/password', { currentPassword, newPassword });
    return response.data;
  }

  // ---- Permissions ----
  async getPermissions(userId?: string) {
    const params = userId ? { userId } : undefined;
    const response = await this.api.get<ApiResponse<any>>('/admin/permissions', { params });
    return response.data;
  }

  async assignPermission(userId: string, clientId: string, companyId: string, flags?: { can_view?: boolean; can_create?: boolean; can_edit?: boolean }) {
    const response = await this.api.post<ApiResponse<any>>('/admin/permissions', {
      userId, clientId, companyId,
      can_view: flags?.can_view !== false,
      can_create: flags?.can_create === true,
      can_edit: flags?.can_edit === true,
    });
    return response.data;
  }

  async updatePermission(permissionId: string, flags: { can_view?: boolean; can_create?: boolean; can_edit?: boolean }) {
    const response = await this.api.put<ApiResponse<any>>(`/admin/permissions/${permissionId}`, flags);
    return response.data;
  }

  async revokePermission(permissionId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/admin/permissions/${permissionId}`);
    return response.data;
  }

  // ==================== Invoices ====================

  async uploadInvoice(file: File, companyId: string, clientId?: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('company_id', companyId);
    if (clientId) formData.append('client_id', clientId);
    const response = await this.api.post<ApiResponse<any>>('/invoices', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  }

  async getInvoices(filters?: { company_id?: string; client_id?: string; status?: string; start_date?: string; end_date?: string; page?: number; limit?: number }) {
    const response = await this.api.get<ApiResponse<any>>('/invoices', { params: filters });
    return response.data;
  }

  async getInvoice(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/invoices/${id}`);
    return response.data;
  }

  async deleteInvoice(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/invoices/${id}`);
    return response.data;
  }

  async reprocessInvoice(id: string) {
    const response = await this.api.post<ApiResponse<any>>(`/invoices/${id}/reprocess`);
    return response.data;
  }

  async getInvoiceStats(filters?: { company_id?: string; company_ids?: string; client_id?: string; country?: string; start_date?: string; end_date?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/invoices/stats', { params: filters });
    return response.data;
  }

  async askInvoiceQuestion(question: string) {
    const response = await this.api.post<ApiResponse<any>>('/invoices/ask', { question });
    return response.data;
  }

  async getInvoiceDownloadUrl(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/invoices/${id}/download`);
    return response.data;
  }

  // ---- Commissions ----
  async getCommissionRates(companyId?: string) {
    const params = companyId ? `?company_id=${companyId}` : '';
    const response = await this.api.get<ApiResponse<any>>(`/commissions/rates${params}`);
    return response.data;
  }
  async upsertCommissionRate(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/commissions/rates', data);
    return response.data;
  }
  async deleteCommissionRate(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/commissions/rates/${id}`);
    return response.data;
  }
  async getSubAgents() {
    const response = await this.api.get<ApiResponse<any>>('/commissions/sub-agents');
    return response.data;
  }
  async createSubAgent(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/commissions/sub-agents', data);
    return response.data;
  }
  async updateSubAgent(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/commissions/sub-agents/${id}`, data);
    return response.data;
  }
  async deleteSubAgent(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/commissions/sub-agents/${id}`);
    return response.data;
  }
  async getSubAgentRates(subAgentId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/commissions/sub-agents/${subAgentId}/rates`);
    return response.data;
  }
  async upsertSubAgentRate(subAgentId: string, data: any) {
    const response = await this.api.post<ApiResponse<any>>(`/commissions/sub-agents/${subAgentId}/rates`, data);
    return response.data;
  }
  async deleteSubAgentRate(rateId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/commissions/sub-agents/rates/${rateId}`);
    return response.data;
  }
  async getInvoiceCommissions(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.company_id) params.set('company_id', filters.company_id);
    if (filters?.client_id) params.set('client_id', filters.client_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.start_date) params.set('start_date', filters.start_date);
    if (filters?.end_date) params.set('end_date', filters.end_date);
    const q = params.toString() ? `?${params.toString()}` : '';
    const response = await this.api.get<ApiResponse<any>>(`/commissions/invoices${q}`);
    return response.data;
  }
  async getInvoiceCommission(invoiceId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/commissions/invoices/${invoiceId}`);
    return response.data;
  }
  async overrideCommission(invoiceId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/commissions/invoices/${invoiceId}/override`, data);
    return response.data;
  }
  async updateCommissionStatus(invoiceId: string, status: string) {
    const response = await this.api.put<ApiResponse<any>>(`/commissions/invoices/${invoiceId}/status`, { status });
    return response.data;
  }
  async recalculateCommission(invoiceId: string) {
    const response = await this.api.post<ApiResponse<any>>(`/commissions/invoices/${invoiceId}/recalculate`);
    return response.data;
  }
  async recalculateAllCommissions() {
    const response = await this.api.post<ApiResponse<any>>('/commissions/recalculate-all');
    return response.data;
  }
  async getCommissionStats(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.company_id) params.set('company_id', filters.company_id);
    if (filters?.start_date) params.set('start_date', filters.start_date);
    if (filters?.end_date) params.set('end_date', filters.end_date);
    const q = params.toString() ? `?${params.toString()}` : '';
    const response = await this.api.get<ApiResponse<any>>(`/commissions/stats${q}`);
    return response.data;
  }

  async getExpenseAllocation(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.company_id) params.set('company_id', filters.company_id);
    if (filters?.company_ids) params.set('company_ids', filters.company_ids);
    if (filters?.start_date) params.set('start_date', filters.start_date);
    if (filters?.end_date) params.set('end_date', filters.end_date);
    const q = params.toString() ? `?${params.toString()}` : '';
    const response = await this.api.get<ApiResponse<any>>(`/commissions/expense-allocation${q}`);
    return response.data;
  }

  // Line item editing
  async updateInvoiceLineItem(invoiceId: string, itemId: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/invoices/${invoiceId}/items/${itemId}`, data);
    return response.data;
  }
  async addInvoiceLineItem(invoiceId: string, data: any) {
    const response = await this.api.post<ApiResponse<any>>(`/invoices/${invoiceId}/items`, data);
    return response.data;
  }
  async deleteInvoiceLineItem(invoiceId: string, itemId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/invoices/${invoiceId}/items/${itemId}`);
    return response.data;
  }
  async updateInvoiceTotal(invoiceId: string, total: number) {
    const response = await this.api.put<ApiResponse<any>>(`/invoices/${invoiceId}/total`, { total });
    return response.data;
  }

  // Projects
  async getProjects(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.supplier_id) params.set('supplier_id', filters.supplier_id);
    if (filters?.client_id) params.set('client_id', filters.client_id);
    if (filters?.country) params.set('country', filters.country);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.project_type) params.set('project_type', filters.project_type);
    if (filters?.search) params.set('search', filters.search);
    const q = params.toString() ? `?${params.toString()}` : '';
    const response = await this.cachedGet<ApiResponse<any>>(`/projects${q}`);
    return response.data;
  }
  async getProject(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/projects/${id}`);
    return response.data;
  }
  async createProject(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/projects', data);
    this.memoryCache.clear();
    return response.data;
  }
  async updateProject(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/projects/${id}`, data);
    this.memoryCache.clear();
    return response.data;
  }
  async deleteProject(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/projects/${id}`);
    this.memoryCache.clear();
    return response.data;
  }
  async getProjectStats() {
    const response = await this.cachedGet<ApiResponse<any>>('/projects/stats/summary');
    return response.data;
  }

  // ---- User Areas ----
  async getUserAreas(userId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/admin/users/${userId}/areas`);
    return response.data;
  }

  async setUserAreas(userId: string, data: { companyIds: string[]; countries: string[] }) {
    const response = await this.api.put<ApiResponse<any>>(`/admin/users/${userId}/areas`, data);
    this.memoryCache.clear();
    return response.data;
  }

  async getUserVisibleClients(userId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/admin/users/${userId}/visible-clients`);
    return response.data;
  }

  // ---- Admin Overrides ----
  async getUserOverrides(userId: string) {
    const response = await this.api.get<ApiResponse<any>>(`/admin/users/${userId}/overrides`);
    return response.data;
  }

  async addUserOverride(userId: string, clientId: string, overrideType: 'grant' | 'deny') {
    const response = await this.api.post<ApiResponse<any>>(`/admin/users/${userId}/overrides`, { clientId, overrideType });
    this.memoryCache.clear();
    return response.data;
  }

  async removeUserOverride(userId: string, clientId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/admin/users/${userId}/overrides/${clientId}`);
    this.memoryCache.clear();
    return response.data;
  }

  // ---- Admin Countries ----
  async getAdminCountries() {
    const response = await this.api.get<ApiResponse<any>>('/admin/countries');
    return response.data;
  }

  // ---- Opportunities ----
  async getOpportunities(filters?: { client_id?: string; company_id?: string; status?: string; visit_id?: string; report_id?: string }) {
    const response = await this.api.get<ApiResponse<any>>('/opportunities', { params: filters });
    return response.data;
  }

  async getOpportunityById(id: string) {
    const response = await this.api.get<ApiResponse<any>>(`/opportunities/${id}`);
    return response.data;
  }

  async createOpportunity(data: any) {
    const response = await this.api.post<ApiResponse<any>>('/opportunities', data);
    return response.data;
  }

  async updateOpportunity(id: string, data: any) {
    const response = await this.api.put<ApiResponse<any>>(`/opportunities/${id}`, data);
    return response.data;
  }

  async deleteOpportunity(id: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/opportunities/${id}`);
    return response.data;
  }

  // Opportunity attachments
  async uploadOpportunityAttachment(opportunityId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/opportunities/${opportunityId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadOpportunityAttachment(opportunityId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<{ url: string; filename: string }>>(`/opportunities/${opportunityId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteOpportunityAttachment(opportunityId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/opportunities/${opportunityId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Opportunity advances
  async addOpportunityAdvance(opportunityId: string, data: { date: string; description: string }) {
    const response = await this.api.post<ApiResponse<any>>(`/opportunities/${opportunityId}/advances`, data);
    return response.data;
  }

  async deleteOpportunityAdvance(opportunityId: string, advanceId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/opportunities/${opportunityId}/advances/${advanceId}`);
    return response.data;
  }

  // Opportunity advance attachments
  async uploadOpportunityAdvanceAttachment(opportunityId: string, advanceId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<any>>(`/opportunities/${opportunityId}/advances/${advanceId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadOpportunityAdvanceAttachment(opportunityId: string, advanceId: string, attachmentId: string) {
    const response = await this.api.get<ApiResponse<{ url: string; filename: string }>>(`/opportunities/${opportunityId}/advances/${advanceId}/attachments/${attachmentId}/download`);
    return response.data;
  }

  async deleteOpportunityAdvanceAttachment(opportunityId: string, advanceId: string, attachmentId: string) {
    const response = await this.api.delete<ApiResponse<any>>(`/opportunities/${opportunityId}/advances/${advanceId}/attachments/${attachmentId}`);
    return response.data;
  }

  // Opportunity exports
  async exportOpportunitiesPdf(filters: any = {}) {
    const response = await this.api.post('/opportunities/export-pdf', filters, { responseType: 'blob' });
    return response.data;
  }

  async exportOpportunitiesExcel(filters: any = {}) {
    const response = await this.api.post('/opportunities/export-excel', filters, { responseType: 'blob' });
    return response.data;
  }

  // ---- Statistics ----
  async getStatistics(filters?: { startDate?: string; endDate?: string }) {
    const response = await this.api.get<ApiResponse<any[]>>('/statistics', { params: filters });
    return response.data;
  }
}

export const apiService = new ApiService();
