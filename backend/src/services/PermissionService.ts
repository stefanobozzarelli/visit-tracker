import { AppDataSource } from '../config/database';
import { UserPermission } from '../entities/UserPermission';
import { User } from '../entities/User';
import { Visit } from '../entities/Visit';

export class PermissionService {
  private permissionRepository = AppDataSource.getRepository(UserPermission);
  private userRepository = AppDataSource.getRepository(User);
  private visitRepository = AppDataSource.getRepository(Visit);

  /**
   * Assign permissions to a user for a client + company combination
   */
  async assignPermission(
    userId: string,
    clientId: string,
    companyId: string,
    canView: boolean = true,
    canCreate: boolean = false,
    canEdit: boolean = false,
    assignedByUserId: string
  ): Promise<UserPermission> {
    // Check if it already exists
    const existing = await this.permissionRepository.findOne({
      where: {
        user_id: userId,
        client_id: clientId,
        company_id: companyId,
      },
    });

    if (existing) {
      // Update permissions
      existing.can_view = canView;
      existing.can_create = canCreate;
      existing.can_edit = canEdit;
      return await this.permissionRepository.save(existing);
    }

    // Create new record
    const permission = this.permissionRepository.create({
      user_id: userId,
      client_id: clientId,
      company_id: companyId,
      can_view: canView,
      can_create: canCreate,
      can_edit: canEdit,
      assigned_by_user_id: assignedByUserId,
    });

    return await this.permissionRepository.save(permission);
  }

  /**
   * Revoke a permission
   */
  async revokePermission(permissionId: string): Promise<void> {
    await this.permissionRepository.delete(permissionId);
  }

  /**
   * Update user permissions for a client + company combination
   */
  async updatePermission(
    permissionId: string,
    canView: boolean,
    canCreate: boolean,
    canEdit: boolean
  ): Promise<UserPermission> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new Error('Permission not found');
    }

    permission.can_view = canView;
    permission.can_create = canCreate;
    permission.can_edit = canEdit;

    return await this.permissionRepository.save(permission);
  }

  /**
   * Check if a user has access to a client + company combination
   */
  async checkPermission(
    userId: string,
    clientId: string,
    companyId: string,
    requiredPermission: 'view' | 'create' | 'edit' = 'view'
  ): Promise<boolean> {
    // Admin has full access
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.role === 'admin') {
      return true;
    }

    // Manager has full access
    if (user?.role === 'backoffice') {
      return true;
    }

    // Sales rep must have explicit permission
    const permission = await this.permissionRepository.findOne({
      where: {
        user_id: userId,
        client_id: clientId,
        company_id: companyId,
      },
    });

    if (!permission) {
      return false;
    }

    if (requiredPermission === 'view') {
      return permission.can_view;
    } else if (requiredPermission === 'create') {
      return permission.can_create;
    } else if (requiredPermission === 'edit') {
      return permission.can_edit;
    }

    return false;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return await this.permissionRepository.find({
      where: { user_id: userId },
      relations: ['client', 'company', 'assigned_by_user'],
    });
  }

  /**
   * Get visible clients for a user
   */
  async getVisibleClients(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Admin sees all clients
    if (user?.role === 'admin' || user?.role === 'backoffice') {
      return ['*']; // Wildcard to indicate "all"
    }

    // Sales rep sees only those with permission
    const permissions = await this.permissionRepository.find({
      where: { user_id: userId },
      select: ['client_id'],
    });

    return permissions.map(p => p.client_id);
  }

  /**
   * Get visible companies for a user for a client
   */
  async getVisibleCompanies(userId: string, clientId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Admin sees all
    if (user?.role === 'admin' || user?.role === 'backoffice') {
      return ['*'];
    }

    // Sales rep sees only those with permission
    const permissions = await this.permissionRepository.find({
      where: {
        user_id: userId,
        client_id: clientId,
      },
      select: ['company_id'],
    });

    return permissions.map(p => p.company_id);
  }

  /**
   * Get all permissions (for admin)
   */
  async getAllPermissions(userId?: string, clientId?: string): Promise<UserPermission[]> {
    let query = this.permissionRepository.createQueryBuilder('perm')
      .leftJoinAndSelect('perm.user', 'user')
      .leftJoinAndSelect('perm.client', 'client')
      .leftJoinAndSelect('perm.company', 'company')
      .leftJoinAndSelect('perm.assigned_by_user', 'assigned_by');

    if (userId) {
      query = query.where('perm.user_id = :userId', { userId });
    }

    if (clientId) {
      query = query.andWhere('perm.client_id = :clientId', { clientId });
    }

    return await query.getMany();
  }

  /**
   * Get all users to assign permissions
   */
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.find({
      select: ['id', 'email', 'name', 'role'],
    });
  }

  /**
   * Delete all permissions for a client
   */
  async deletePermissionsByClientId(clientId: string): Promise<void> {
    await this.permissionRepository.delete({ client_id: clientId });
  }

  /**
   * Delete a user and all associated data
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Delete user's visits
    await this.visitRepository.delete({ visited_by_user_id: userId });

    // Delete user's permissions
    await this.permissionRepository.delete({ user_id: userId });

    // Delete the user
    await this.userRepository.delete(userId);
  }
}
