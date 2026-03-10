export interface AuthPayload {
  id: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  role?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateClientRequest {
  name: string;
  country: string;
  notes?: string;
  role?: string; // 'cliente', 'developer', 'architetto-designer'
}

export interface CreateCompanyRequest {
  name: string;
  country: string;
  industry?: string;
}

export interface CreateVisitRequest {
  client_id: string;
  visit_date: string;
  reports: CreateVisitReportRequest[];
}

export interface CreateVisitReportRequest {
  company_id: string;
  section: string;
  content: string;
}

export interface CreateContactRequest {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}
