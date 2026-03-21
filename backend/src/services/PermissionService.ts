import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { UserPermission } from '../entities/UserPermission';
import { User } from '../entities/User';
import { Visit } from '../entities/Visit';
import { UserCompany } from '../entities/UserCompany';
import { UserCountry } from '../entities/UserCountry';
import { ClientCompany } from '../entities/ClientCompany';
import { Company } from '../entities/Company';
import { Client } from '../entities/Client';

export class PermissionService {
  private permissionRepository = AppDataSource.getRepository(UserPermission);
  private userRepository = AppDataSource.getRepository(User);
  private visitRepository = AppDataSource.getRepository(Visit);
  private userCompanyRepository = AppDataSource.getRepository(UserCompany);
  private userCountryRepository = AppDataSource.getRepository(UserCountry);
  private clientCompanyRepository = AppDataSource.getRepository(ClientCompany);
  private companyRepository = AppDataSource.getRepository(Company);
  private clientRepository = AppDataSource.getRepository(Client);

  private isAdmin(role: string): boolean {
    return role === 'admin' || role === 'manager' || role === 'master_admin';
  }

  // =============================================
  // USER AREAS (companies + countries)
  // =============================================

  async getUserAreas(userId: string): Promise<{ companies: Company[]; countries: string[] }> {
    const userCompanies = await this.userCompanyRepository.find({
      where: { user_id: userId },
      relations: ['company'],
    });
    const userCountries = await this.userCountryRepository.find({
      where: { user_id: userId },
    });
    return {
      companies: userCompanies.map(uc => uc.company),
      countries: userCountries.map(uc => uc.country),
    };
  }

  async setUserAreas(
    userId: string,
    companyIds: string[],
    countries: string[],
    assignedByUserId: string
  ): Promise<void> {
    // Replace user companies
    await this.userCompanyRepository.delete({ user_id: userId });
    if (companyIds.length > 0) {
      const userCompanies = companyIds.map(companyId =>
        this.userCompanyRepository.create({
          user_id: userId,
          company_id: companyId,
          assigned_by_user_id: assignedByUserId,
        })
      );
      await this.userCompanyRepository.save(userCompanies);
    }

    // Replace user countries
    await this.userCountryRepository.delete({ user_id: userId });
    if (countries.length > 0) {
      const userCountries = countries.map(country =>
        this.userCountryRepository.create({
          user_id: userId,
          country,
          assigned_by_user_id: assignedByUserId,
        })
      );
      await this.userCountryRepository.save(userCountries);
    }
  }

  // =============================================
  // CLIENT-COMPANY ASSOCIATIONS
  // =============================================

  async getClientCompanies(clientId: string): Promise<ClientCompany[]> {
    return await this.clientCompanyRepository.find({
      where: { client_id: clientId },
      relations: ['company'],
    });
  }

  async setClientCompanies(clientId: string, companyIds: string[]): Promise<void> {
    await this.clientCompanyRepository.delete({ client_id: clientId });
    if (companyIds.length > 0) {
      const rows = companyIds.map(companyId =>
        this.clientCompanyRepository.create({ client_id: clientId, company_id: companyId })
      );
      await this.clientCompanyRepository.save(rows);
    }
  }

  // =============================================
  // ADMIN OVERRIDES (grant / deny)
  // =============================================

  async getOverrides(userId: string): Promise<UserPermission[]> {
    return await this.permissionRepository.find({
      where: { user_id: userId },
      relations: ['client'],
    });
  }

  async addOverride(
    userId: string,
    clientId: string,
    overrideType: 'grant' | 'deny',
    assignedByUserId: string
  ): Promise<UserPermission> {
    // Upsert: check if exists
    const existing = await this.permissionRepository.findOne({
      where: { user_id: userId, client_id: clientId },
    });
    if (existing) {
      existing.override_type = overrideType;
      existing.assigned_by_user_id = assignedByUserId;
      return await this.permissionRepository.save(existing);
    }
    const override = this.permissionRepository.create({
      user_id: userId,
      client_id: clientId,
      override_type: overrideType,
      assigned_by_user_id: assignedByUserId,
    });
    return await this.permissionRepository.save(override);
  }

  async removeOverride(userId: string, clientId: string): Promise<void> {
    await this.permissionRepository.delete({ user_id: userId, client_id: clientId });
  }

  // =============================================
  // VISIBILITY (core permission logic)
  // =============================================

  /**
   * Get visible clients for a user based on areas + overrides
   */
  async getVisibleClients(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return [];

    // Admin/Manager/Master Admin see all
    if (this.isAdmin(user.role)) {
      return ['*'];
    }

    // Get user's areas
    const userCompanies = await this.userCompanyRepository.find({
      where: { user_id: userId },
      select: ['company_id'],
    });
    const userCountries = await this.userCountryRepository.find({
      where: { user_id: userId },
      select: ['country'],
    });

    const companyIds = userCompanies.map(uc => uc.company_id);
    const countries = userCountries.map(uc => uc.country);

    // Area-derived visible clients
    let areaClientIds: string[] = [];
    if (companyIds.length > 0 && countries.length > 0) {
      const results = await this.clientCompanyRepository
        .createQueryBuilder('cc')
        .innerJoin('cc.client', 'c')
        .select('DISTINCT cc.client_id', 'client_id')
        .where('cc.company_id IN (:...companyIds)', { companyIds })
        .andWhere('c.country IN (:...countries)', { countries })
        .getRawMany();
      areaClientIds = results.map((r: any) => r.client_id);
    }

    // Apply overrides
    const overrides = await this.permissionRepository.find({
      where: { user_id: userId },
    });

    const visibleSet = new Set(areaClientIds);
    for (const o of overrides) {
      if (o.override_type === 'grant') {
        visibleSet.add(o.client_id);
      } else if (o.override_type === 'deny') {
        visibleSet.delete(o.client_id);
      }
    }

    return Array.from(visibleSet);
  }

  /**
   * Get visible companies for a user for a specific client
   * Returns intersection of user's companies and client's companies
   */
  async getVisibleCompanies(userId: string, clientId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return [];

    if (this.isAdmin(user.role)) {
      return ['*'];
    }

    const userCompanies = await this.userCompanyRepository.find({
      where: { user_id: userId },
      select: ['company_id'],
    });
    const clientCompanies = await this.clientCompanyRepository.find({
      where: { client_id: clientId },
      select: ['company_id'],
    });

    const userCompanySet = new Set(userCompanies.map(uc => uc.company_id));
    return clientCompanies
      .filter(cc => userCompanySet.has(cc.company_id))
      .map(cc => cc.company_id);
  }

  /**
   * Check if a user has access to a client (simplified: binary access)
   */
  async checkPermission(
    userId: string,
    clientId: string,
    _companyId?: string,
    _requiredPermission?: 'view' | 'create' | 'edit'
  ): Promise<boolean> {
    const visibleClients = await this.getVisibleClients(userId);
    if (visibleClients.includes('*')) return true;
    return visibleClients.includes(clientId);
  }

  // =============================================
  // LEGACY COMPAT + ADMIN UTILS
  // =============================================

  /**
   * Get all users for admin views
   */
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.find({
      select: ['id', 'email', 'name', 'role', 'can_view_revenue'],
    });
  }

  /**
   * Get computed visible clients with details (for admin preview)
   */
  async getVisibleClientsPreview(userId: string): Promise<Client[]> {
    const visibleIds = await this.getVisibleClients(userId);
    if (visibleIds.includes('*')) {
      return await this.clientRepository.find({ relations: ['clientCompanies', 'clientCompanies.company'] });
    }
    if (visibleIds.length === 0) return [];
    return await this.clientRepository.find({
      where: { id: In(visibleIds) },
      relations: ['clientCompanies', 'clientCompanies.company'],
    });
  }

  /**
   * Get all known countries (from clients)
   */
  async getAllCountries(): Promise<string[]> {
    const results = await this.clientRepository
      .createQueryBuilder('c')
      .select('DISTINCT c.country', 'country')
      .where('c.country IS NOT NULL')
      .andWhere("c.country != ''")
      .orderBy('c.country')
      .getRawMany();
    return results.map((r: any) => r.country);
  }

  /**
   * Delete a user and all associated data
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    await this.visitRepository.delete({ visited_by_user_id: userId });
    await this.permissionRepository.delete({ user_id: userId });
    await this.userCompanyRepository.delete({ user_id: userId });
    await this.userCountryRepository.delete({ user_id: userId });
    await this.userRepository.delete(userId);
  }

  // Keep for backward compat during migration — will be removed
  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return await this.permissionRepository.find({
      where: { user_id: userId },
      relations: ['client'],
    });
  }

  async getAllPermissions(userId?: string, clientId?: string): Promise<UserPermission[]> {
    let query = this.permissionRepository.createQueryBuilder('perm')
      .leftJoinAndSelect('perm.user', 'user')
      .leftJoinAndSelect('perm.client', 'client')
      .leftJoinAndSelect('perm.assigned_by_user', 'assigned_by');

    if (userId) {
      query = query.where('perm.user_id = :userId', { userId });
    }
    if (clientId) {
      query = query.andWhere('perm.client_id = :clientId', { clientId });
    }

    return await query.getMany();
  }

  async assignPermission(
    userId: string,
    clientId: string,
    companyId: string,
    canView: boolean = true,
    canCreate: boolean = false,
    canEdit: boolean = false,
    assignedByUserId: string
  ): Promise<UserPermission> {
    const existing = await this.permissionRepository.findOne({
      where: { user_id: userId, client_id: clientId, company_id: companyId },
    });
    if (existing) {
      existing.can_view = canView;
      existing.can_create = canCreate;
      existing.can_edit = canEdit;
      return await this.permissionRepository.save(existing);
    }
    const permission = this.permissionRepository.create({
      user_id: userId, client_id: clientId, company_id: companyId,
      can_view: canView, can_create: canCreate, can_edit: canEdit,
      assigned_by_user_id: assignedByUserId,
    });
    return await this.permissionRepository.save(permission);
  }

  async revokePermission(permissionId: string): Promise<void> {
    await this.permissionRepository.delete(permissionId);
  }

  async updatePermission(permissionId: string, canView: boolean, canCreate: boolean, canEdit: boolean): Promise<UserPermission> {
    const permission = await this.permissionRepository.findOne({ where: { id: permissionId } });
    if (!permission) throw new Error('Permission not found');
    permission.can_view = canView;
    permission.can_create = canCreate;
    permission.can_edit = canEdit;
    return await this.permissionRepository.save(permission);
  }

  async deletePermissionsByClientId(clientId: string): Promise<void> {
    await this.permissionRepository.delete({ client_id: clientId });
  }
}
