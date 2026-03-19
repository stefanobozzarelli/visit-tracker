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
  entities: [User, Company, Client, ClientContact, Visit, VisitReport, VisitAttachment, UserPermission, TodoItem, CustomerOrder, CustomerOrderItem, Invoice, InvoiceLineItem, CommissionRate, SubAgent, SubAgentCommissionRate, InvoiceCommission, InvoiceSubAgentCommission, SubAgentExpense],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
});
