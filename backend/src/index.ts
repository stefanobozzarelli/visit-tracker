import 'reflect-metadata';
import { Client as PgClient } from 'pg';
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
import opportunityRoutes from './routes/opportunities';
import statisticsRoutes from './routes/statistics';
import tripRoutes from './routes/trips';
import parseBookingRoutes from './routes/parse-booking';
import todoistRoutes from './routes/todoist';
import mcpRoutes from './routes/mcp';
import priceListRoutes from './routes/priceLists';
import articleRoutes from './routes/articles';
import { WeeklyScheduler } from './services/WeeklyScheduler';

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Railway sits in front of the app as one proxy: trust exactly that hop, so
// req.ip is the visitor's address and cannot be faked with X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
app.disable('x-powered-by');

// Middleware
// rawBody serve per verificare la firma HMAC dei webhook Todoist
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
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
app.use('/api/price-lists', priceListRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/company-visits', companyVisitRoutes);
app.use('/api/showrooms', showroomRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/parse-booking', parseBookingRoutes);
app.use('/api/integrations/todoist', todoistRoutes);

// Claude connector: /mcp, /oauth/* and /.well-known/oauth-* (read-only)
app.use(mcpRoutes);

// Errors raised by middleware (oversized uploads, malformed JSON) get a short
// JSON reply instead of a stack trace.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }
  console.error('Unhandled error:', err?.message || err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0' });
});

// Pre-migration: convert clients.role from PostgreSQL enum to varchar
// (TypeORM synchronize cannot change enum values; varchar is simpler and flexible)
async function runPreMigrations() {
  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USERNAME || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_DATABASE || 'visit_tracker'}`;
  const pg = new PgClient({ connectionString });
  try {
    await pg.connect();
    // Convert role column from enum to varchar (safe, idempotent)
    await pg.query(`
      ALTER TABLE clients
        ALTER COLUMN role TYPE varchar
        USING role::varchar
    `);
    console.log('Pre-migration: clients.role converted to varchar');
  } catch (e: any) {
    // Ignore if already varchar or column doesn't exist yet
    if (!e.message?.includes('already exists') && !e.message?.includes('does not exist') && !e.message?.includes('varchar')) {
      console.log('Pre-migration note:', e.message);
    }
  } finally {
    await pg.end();
  }
}

// Initialize database and start server
runPreMigrations().then(() => AppDataSource.initialize())
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
      // Article matching also tries the code without leading zeros ("0013288" = "13288")
      await qr.query(`
        CREATE INDEX IF NOT EXISTS idx_articles_company_code_nozeros
        ON articles (company_id, ltrim(normalized_code, '0'));
      `).catch(() => {});
      // Invoice lines processed before price lists existed: link them once, in the background
      setTimeout(async () => {
        try {
          const companies = await AppDataSource.query(`
            SELECT DISTINCT inv.company_id FROM invoice_line_items li
            JOIN invoices inv ON inv.id::text = li.invoice_id::text
            WHERE li.match_status IS NULL`);
          if (!companies.length) return;
          const { ArticleService } = require('./services/ArticleService');
          const articleService = new ArticleService();
          for (const c of companies) await articleService.matchLineItems({ companyId: String(c.company_id) });
          console.log(`Article matching: checked old invoice lines of ${companies.length} companies`);
        } catch (e) { console.log('Article matching note:', (e as Error).message); }
      }, 5000);
      await qr.release();
      console.log('Database schema updates applied');
    } catch (e) {
      console.log('Schema update note:', (e as Error).message);
    }

    // Start weekly email scheduler
    const weeklyScheduler = new WeeklyScheduler();
    weeklyScheduler.start();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
