import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { Company } from '../entities/Company';
import { Client } from '../entities/Client';
import { ClientContact } from '../entities/ClientContact';
import { Visit } from '../entities/Visit';
import { VisitReport } from '../entities/VisitReport';
import { VisitAttachment } from '../entities/VisitAttachment';
import { UserPermission } from '../entities/UserPermission';
import { TodoItem } from '../entities/TodoItem';
import { CustomerOrder } from '../entities/CustomerOrder';
import { CustomerOrderItem } from '../entities/CustomerOrderItem';
import { Invoice } from '../entities/Invoice';
import { InvoiceLineItem } from '../entities/InvoiceLineItem';
import { CommissionRate } from '../entities/CommissionRate';
import { SubAgent } from '../entities/SubAgent';
import { SubAgentCommissionRate } from '../entities/SubAgentCommissionRate';
import { InvoiceCommission } from '../entities/InvoiceCommission';
import { InvoiceSubAgentCommission } from '../entities/InvoiceSubAgentCommission';
import { SubAgentExpense } from '../entities/SubAgentExpense';
import { Project } from '../entities/Project';
import { TodoAttachment } from '../entities/TodoAttachment';
import { Claim } from '../entities/Claim';
import { ClaimMovement } from '../entities/ClaimMovement';
import { ClaimMovementAttachment } from '../entities/ClaimMovementAttachment';
import { CompanyVisit } from '../entities/CompanyVisit';
import { CompanyVisitAttachment } from '../entities/CompanyVisitAttachment';
import { VisitDirectAttachment } from '../entities/VisitDirectAttachment';
import { UserCompany } from '../entities/UserCompany';
import { UserCountry } from '../entities/UserCountry';
import { ClientCompany } from '../entities/ClientCompany';
import { Showroom } from '../entities/Showroom';
import { ShowroomPhotoAlbum } from '../entities/ShowroomPhotoAlbum';
import { ShowroomPhoto } from '../entities/ShowroomPhoto';
import { Offer } from '../entities/Offer';
import { OfferItem } from '../entities/OfferItem';
import { OfferAttachment } from '../entities/OfferAttachment';
import { OfferItemAttachment } from '../entities/OfferItemAttachment';

require('dotenv').config();

const isDevelopment = process.env.NODE_ENV !== 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'visit_tracker',
  synchronize: true,
  logging: isDevelopment,
  entities: [User, Company, Client, ClientContact, Visit, VisitReport, VisitAttachment, UserPermission, TodoItem, TodoAttachment, CustomerOrder, CustomerOrderItem, Invoice, InvoiceLineItem, CommissionRate, SubAgent, SubAgentCommissionRate, InvoiceCommission, InvoiceSubAgentCommission, SubAgentExpense, Project, Claim, ClaimMovement, ClaimMovementAttachment, CompanyVisit, CompanyVisitAttachment, VisitDirectAttachment, UserCompany, UserCountry, ClientCompany, Showroom, ShowroomPhotoAlbum, ShowroomPhoto, Offer, OfferItem, OfferAttachment, OfferItemAttachment],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
});
