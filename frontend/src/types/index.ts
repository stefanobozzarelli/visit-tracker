export interface User {
  id: string;
  email: string;
  name: string;
  role: 'master_admin' | 'admin' | 'manager' | 'sales_rep';
  can_view_revenue?: boolean;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  isInitializing: boolean;
  authMode: 'online' | 'offline';
}

export interface Client {
  id: string;
  name: string;
  country: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  contacts?: ClientContact[];
}

export interface ClientContact {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  notes?: string;
  client_id: string;
}

export interface Company {
  id: string;
  name: string;
  country: string;
  industry?: string;
  rapporto?: string;
  created_at: string;
}

export interface Visit {
  id: string;
  client_id: string;
  visited_by_user_id: string;
  visit_date: string;
  created_at: string;
  client?: Client;
  visited_by_user?: User;
  reports?: VisitReport[];
}

export interface VisitReport {
  id: string;
  visit_id: string;
  company_id: string;
  section: string;
  content: string;
  status: 'draft' | 'submitted' | 'approved';
  created_at: string;
  updated_at: string;
  company?: Company;
  attachments?: VisitAttachment[];
}

export interface VisitAttachment {
  id: string;
  visit_report_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  due_date?: string;
  assigned_to_user_id: string;
  created_by_user_id: string;
  client_id: string;
  company_id: string;
  visit_report_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  assigned_to_user?: User;
  created_by_user?: User;
  client?: Client;
  company?: Company;
}

export interface CustomerOrderItem {
  id: string;
  order_id: string;
  article_code: string;
  description: string;
  format?: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  total_line: number;
  created_at: string;
}

export interface CustomerOrder {
  id: string;
  visit_id: string;
  supplier_id: string;
  supplier_name: string;
  client_id: string;
  client_name: string;
  order_date: string;
  payment_method?: string;
  notes?: string;
  status: 'draft' | 'confirmed' | 'completed';
  total_amount: number;
  created_at: string;
  updated_at: string;
  // Relations
  visit?: Visit;
  supplier?: User;
  client?: Client;
  items?: CustomerOrderItem[];
}

export interface CommissionRate {
  id: string;
  company_id: string;
  country?: string;
  client_id?: string;
  rate_percent: number;
  company?: Company;
  client?: Client;
}

export interface SubAgentItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  user_id?: string;
  user?: User;
  rates?: SubAgentCommissionRateItem[];
}

export interface SubAgentCommissionRateItem {
  id: string;
  sub_agent_id: string;
  company_id: string;
  country?: string;
  client_id?: string;
  rate_percent: number;
  calc_on: 'gross' | 'residual';
  priority: number;
  company?: Company;
  client?: Client;
}

export interface InvoiceCommissionItem {
  id: string;
  invoice_id: string;
  commission_rate_percent: number;
  gross_commission: number;
  net_commission: number;
  manual_override: boolean;
  manual_amount?: number;
  commission_status: 'aggiunta' | 'controllata' | 'fatturata' | 'pagata' | 'pagati_subagenti';
  notes?: string;
  invoice?: any;
  sub_agent_commissions?: InvoiceSubAgentCommissionItem[];
}

export interface InvoiceSubAgentCommissionItem {
  id: string;
  sub_agent_id: string;
  rate_percent: number;
  calc_on: string;
  amount: number;
  sub_agent?: SubAgentItem;
}
