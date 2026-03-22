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
  city?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  contacts?: ClientContact[];
  clientCompanies?: ClientCompany[];
  has_showroom?: boolean;
  showroom_count?: number;
}

export interface ClientContact {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  notes?: string;
  business_card_filename?: string;
  business_card_s3_key?: string;
  business_card_file_size?: number;
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

export interface ClientCompany {
  id: string;
  client_id: string;
  company_id: string;
  created_at: string;
  company?: Company;
}

export interface UserArea {
  companies: Company[];
  countries: string[];
}

export interface AdminOverride {
  id: string;
  user_id: string;
  client_id: string;
  override_type: 'grant' | 'deny';
  assigned_by_user_id: string;
  created_at: string;
  client?: Client;
}

export interface VisitDirectAttachment {
  id: string;
  visit_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
}

export type ShowroomStatus = 'open' | 'closed' | 'opening' | 'none';
export type ShowroomType = 'shop_in_shop' | 'dedicated';

export interface Showroom {
  id: string;
  name: string;
  client_id: string;
  company_id?: string;
  status: ShowroomStatus;
  type?: ShowroomType | null;
  sqm?: number;
  address?: string;
  city?: string;
  province?: string;
  area?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  company?: Company;
  created_by_user?: User;
  albums?: ShowroomPhotoAlbum[];
}

export interface ShowroomPhotoAlbum {
  id: string;
  showroom_id: string;
  date: string;
  title?: string;
  description?: string;
  created_by_user_id: string;
  created_at: string;
  photos?: ShowroomPhoto[];
  created_by_user?: User;
}

export interface ShowroomPhoto {
  id: string;
  album_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
}

export interface Visit {
  id: string;
  client_id: string;
  visited_by_user_id: string;
  visit_date: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  preparation?: string | null;
  created_at: string;
  updated_at?: string;
  client?: Client;
  visited_by_user?: User;
  reports?: VisitReport[];
  direct_attachments?: VisitDirectAttachment[];
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

// Claims
export interface ClaimMovementAttachment {
  id: string;
  movement_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
}

export interface ClaimMovement {
  id: string;
  claim_id: string;
  date: string;
  action: string;
  created_by_user_id: string;
  created_at: string;
  created_by_user?: User;
  attachments?: ClaimMovementAttachment[];
}

export interface Claim {
  id: string;
  client_id: string;
  company_id: string;
  date: string;
  comments?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  company?: Company;
  created_by_user?: User;
  movements?: ClaimMovement[];
}

export interface TodoAttachment {
  id: string;
  todo_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
}

export interface CompanyVisit {
  id: string;
  company_id: string;
  date: string;
  subject: string;
  report?: string | null;
  participants_user_ids?: string | null;
  participants_external?: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  company?: Company;
  created_by_user?: User;
  attachments?: CompanyVisitAttachment[];
}

export interface CompanyVisitAttachment {
  id: string;
  company_visit_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
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
  visit_id?: string;
  claim_id?: string;
  company_visit_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  assigned_to_user?: User;
  created_by_user?: User;
  client?: Client;
  company?: Company;
  attachments?: TodoAttachment[];
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

export interface Project {
  id: string;
  project_number: number;
  supplier_id?: string;
  client_id?: string;
  country?: string;
  registration_date?: string;
  project_name?: string;
  status: 'ATTIVO' | 'COMPLETATO' | 'SOSPESO' | 'CANCELLATO';
  project_development?: string;
  project_registration?: string;
  project_address?: string;
  project_type?: string;
  detail_of_project_type?: string;
  designated_area?: string;
  architect_designer?: string;
  developer?: string;
  contractor?: string;
  item?: string;
  quantity?: string;
  note?: string;
  estimated_order_date?: string;
  estimated_delivery_date?: string;
  estimated_arrival_date?: string;
  project_value?: number;
  total_value_shipped?: number;
  created_at: string;
  updated_at: string;
  supplier?: Company;
  client?: Client;
}

// ---- Offers ----
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface OfferItem {
  id: string;
  offer_id: string;
  serie?: string;
  articolo?: string;
  finitura?: string;
  formato?: string;
  spessore_mm?: number;
  prezzo_unitario: number;
  unita_misura?: string;
  quantita: number;
  total_amount: number;
  data?: string;
  tipo_offerta: 'progetto' | 'retail';
  promozionale: boolean;
  numero_progetto?: string;
  progetto_nome?: string;
  fase_progetto?: string;
  sviluppo_progetto?: string;
  project_id?: string;
  consegna_prevista?: string;
  note?: string;
  created_at: string;
  project?: Project;
  attachments?: OfferItemAttachment[];
}

export interface OfferAttachment {
  id: string;
  offer_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
}

export interface OfferItemAttachment {
  id: string;
  offer_item_id: string;
  filename: string;
  file_size: number;
  s3_key: string;
  uploaded_by_user_id: string;
  created_at: string;
  uploaded_by_user?: User;
}

export interface Offer {
  id: string;
  client_id?: string;
  company_id?: string;
  visit_id?: string;
  company_visit_id?: string;
  offer_date: string;
  valid_until?: string;
  status: OfferStatus;
  currency?: string;
  notes?: string;
  total_amount: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  company?: Company;
  visit?: Visit;
  company_visit?: any;
  created_by_user?: User;
  items?: OfferItem[];
  attachments?: OfferAttachment[];
}
