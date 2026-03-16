export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'sales_rep';
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
  client_id: string;
}

export interface Company {
  id: string;
  name: string;
  country: string;
  industry?: string;
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
