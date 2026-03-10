import { AppDataSource } from '../config/database';
import { UserPermission } from '../entities/UserPermission';
import { User } from '../entities/User';
import { Visit } from '../entities/Visit';

export class PermissionService {
  private permissionRepository = AppDataSource.getRepository(UserPermission);
  private userRepository = AppDataSource.getRepository(User);
  private visitRepository = AppDataSource.getRepository(Visit);

  /**
   * Assegna permessi a un utente per una combinazione cliente + azienda
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
    // Verifica se esiste già
    const existing = await this.permissionRepository.findOne({
      where: {
        user_id: userId,
        client_id: clientId,
        company_id: companyId,
      },
    });

    if (existing) {
      // Aggiorna i permessi
      existing.can_view = canView;
      existing.can_create = canCreate;
      existing.can_edit = canEdit;
      return await this.permissionRepository.save(existing);
    }

    // Crea nuovo record
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
   * Revoca un permesso
   */
  async revokePermission(permissionId: string): Promise<void> {
    await this.permissionRepository.delete(permissionId);
  }

  /**
   * Verifica se un utente ha accesso a una combinazione cliente + azienda
   */
  async checkPermission(
    userId: string,
    clientId: string,
    companyId: string,
    requiredPermission: 'view' | 'create' | 'edit' = 'view'
  ): Promise<boolean> {
    // Admin ha accesso totale
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.role === 'admin') {
      return true;
    }

    // Manager ha accesso totale
    if (user?.role === 'manager') {
      return true;
    }

    // Sales rep deve avere permesso esplicito
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
   * Ottiene tutti i permessi di un utente
   */
  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return await this.permissionRepository.find({
      where: { user_id: userId },
      relations: ['client', 'company', 'assigned_by_user'],
    });
  }

  /**
   * Ottiene i clienti visibili a un utente
   */
  async getVisibleClients(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Admin vede tutti i clienti
    if (user?.role === 'admin' || user?.role === 'manager') {
      return ['*']; // Wildcard per indicare "tutti"
    }

    // Sales rep vede solo quelli con permesso
    const permissions = await this.permissionRepository.find({
      where: { user_id: userId },
      select: ['client_id'],
    });

    return permissions.map(p => p.client_id);
  }

  /**
   * Ottiene le aziende visibili a un utente per un cliente
   */
  async getVisibleCompanies(userId: string, clientId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Admin vede tutte
    if (user?.role === 'admin' || user?.role === 'manager') {
      return ['*'];
    }

    // Sales rep vede solo quelle con permesso
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
   * Ottiene tutti i permessi (per admin)
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
   * Ottiene tutti gli utenti per assegnare permessi
   */
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.find({
      select: ['id', 'email', 'name', 'role'],
    });
  }

  /**
   * Cancella un utente e tutti i suoi dati associati
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('Utente non trovato');
    }

    // Elimina le visite dell'utente
    await this.visitRepository.delete({ visited_by_user_id: userId });

    // Elimina i permessi dell'utente
    await this.permissionRepository.delete({ user_id: userId });

    // Elimina l'utente
    await this.userRepository.delete(userId);
  }
}
