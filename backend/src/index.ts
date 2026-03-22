import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { AppDataSource } from './config/database';
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import companyRoutes from './routes/companies';
import visitRoutes from './routes/visits';
import adminRoutes from './routes/admin';
import todoRoutes from './routes/todos';
import searchRoutes from './routes/search';
import ordersRoutes from './routes/orders';
import invoiceRoutes from './routes/invoices';
import commissionRoutes from './routes/commissions';
import projectRoutes from './routes/projects';
import claimRoutes from './routes/claims';
import companyVisitRoutes from './routes/company-visits';
import showroomRoutes from './routes/showrooms';
import offerRoutes from './routes/offers';

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/company-visits', companyVisitRoutes);
app.use('/api/showrooms', showroomRoutes);
app.use('/api/offers', offerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0' });
});

// Initialize database and start server
AppDataSource.initialize()
  .then(async () => {
    console.log('Database connection established');

    // Ensure master_admin enum value and can_view_revenue column exist
    try {
      const qr = AppDataSource.createQueryRunner();
      // Add master_admin to role enum if not exists
      await qr.query(`
        DO $$ BEGIN
          ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'master_admin' BEFORE 'admin';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `).catch(() => {});
      // Ensure can_view_revenue column exists
      await qr.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_revenue BOOLEAN DEFAULT false;
      `).catch(() => {});
      // Set Stefano as master_admin (one-time, safe to re-run)
      await qr.query(`
        UPDATE users SET role = 'master_admin' WHERE email = 'stefanobozzarelli@gmail.com' AND role != 'master_admin';
      `).catch(() => {});
      // Unique index for commission_rates (handles NULLs)
      await qr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rates_unique
        ON commission_rates (company_id, COALESCE(country, ''), COALESCE(client_id, '00000000-0000-0000-0000-000000000000'));
      `).catch(() => {});
      await qr.release();
      console.log('Database schema updates applied');
    } catch (e) {
      console.log('Schema update note:', (e as Error).message);
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
