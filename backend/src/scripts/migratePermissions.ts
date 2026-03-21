/**
 * One-time migration script: Populate new area-based permission tables
 * from existing user_permissions data.
 *
 * Run with: npx ts-node src/scripts/migratePermissions.ts
 */
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { UserPermission } from '../entities/UserPermission';
import { UserCompany } from '../entities/UserCompany';
import { UserCountry } from '../entities/UserCountry';
import { ClientCompany } from '../entities/ClientCompany';
import { Client } from '../entities/Client';
import { VisitReport } from '../entities/VisitReport';
import { Visit } from '../entities/Visit';

async function migrate() {
  await AppDataSource.initialize();
  console.log('Connected to database');

  const permRepo = AppDataSource.getRepository(UserPermission);
  const ucRepo = AppDataSource.getRepository(UserCompany);
  const ucountryRepo = AppDataSource.getRepository(UserCountry);
  const ccRepo = AppDataSource.getRepository(ClientCompany);
  const clientRepo = AppDataSource.getRepository(Client);

  // 1. Populate client_companies from visit reports
  console.log('\n=== Step 1: Populate client_companies from visit reports ===');
  const visitReportResults = await AppDataSource.getRepository(VisitReport)
    .createQueryBuilder('vr')
    .innerJoin(Visit, 'v', 'v.id = vr.visit_id')
    .select('DISTINCT v.client_id', 'client_id')
    .addSelect('vr.company_id', 'company_id')
    .where('vr.company_id IS NOT NULL')
    .getRawMany();

  let ccCreated = 0;
  for (const row of visitReportResults) {
    const exists = await ccRepo.findOne({
      where: { client_id: row.client_id, company_id: row.company_id },
    });
    if (!exists) {
      await ccRepo.save(ccRepo.create({ client_id: row.client_id, company_id: row.company_id }));
      ccCreated++;
    }
  }
  console.log(`  Created ${ccCreated} client_companies from visit reports`);

  // Also from existing user_permissions
  const permResults = await permRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.client_id', 'client_id')
    .addSelect('p.company_id', 'company_id')
    .where('p.client_id IS NOT NULL')
    .andWhere('p.company_id IS NOT NULL')
    .getRawMany();

  let ccFromPerms = 0;
  for (const row of permResults) {
    const exists = await ccRepo.findOne({
      where: { client_id: row.client_id, company_id: row.company_id },
    });
    if (!exists) {
      await ccRepo.save(ccRepo.create({ client_id: row.client_id, company_id: row.company_id }));
      ccFromPerms++;
    }
  }
  console.log(`  Created ${ccFromPerms} client_companies from user_permissions`);

  // 2. Populate user_companies from user_permissions
  console.log('\n=== Step 2: Populate user_companies ===');
  const userCompanyResults = await permRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.user_id', 'user_id')
    .addSelect('p.company_id', 'company_id')
    .where('p.user_id IS NOT NULL')
    .andWhere('p.company_id IS NOT NULL')
    .getRawMany();

  let ucCreated = 0;
  for (const row of userCompanyResults) {
    const exists = await ucRepo.findOne({
      where: { user_id: row.user_id, company_id: row.company_id },
    });
    if (!exists) {
      await ucRepo.save(ucRepo.create({ user_id: row.user_id, company_id: row.company_id }));
      ucCreated++;
    }
  }
  console.log(`  Created ${ucCreated} user_companies`);

  // 3. Populate user_countries from user_permissions + clients
  console.log('\n=== Step 3: Populate user_countries ===');
  const userCountryResults = await permRepo
    .createQueryBuilder('p')
    .innerJoin(Client, 'c', 'c.id = p.client_id')
    .select('DISTINCT p.user_id', 'user_id')
    .addSelect('c.country', 'country')
    .where('p.user_id IS NOT NULL')
    .andWhere('c.country IS NOT NULL')
    .andWhere("c.country != ''")
    .getRawMany();

  let countryCreated = 0;
  for (const row of userCountryResults) {
    const exists = await ucountryRepo.findOne({
      where: { user_id: row.user_id, country: row.country },
    });
    if (!exists) {
      await ucountryRepo.save(ucountryRepo.create({ user_id: row.user_id, country: row.country }));
      countryCreated++;
    }
  }
  console.log(`  Created ${countryCreated} user_countries`);

  // Summary
  const totalCC = await ccRepo.count();
  const totalUC = await ucRepo.count();
  const totalUCountry = await ucountryRepo.count();
  console.log('\n=== Migration Summary ===');
  console.log(`  client_companies: ${totalCC}`);
  console.log(`  user_companies: ${totalUC}`);
  console.log(`  user_countries: ${totalUCountry}`);
  console.log('\nMigration complete!');

  await AppDataSource.destroy();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
