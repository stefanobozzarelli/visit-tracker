import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';

export class UserService {
  private userRepository = AppDataSource.getRepository(User);

  /**
   * Crea un nuovo utente
   */
  async createUser(
    email: string,
    name: string,
    password: string,
    role: string = 'sales_rep',
    company_id?: string
  ): Promise<User> {
    // Validazione email unica
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Validazione password
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Validazione ruolo
    const validRoles = ['admin', 'backoffice', 'sales_rep'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crea utente
    const user = this.userRepository.create({
      email,
      name,
      password_hash: hashedPassword,
      role,
      company_id: company_id || null,
    });

    return await this.userRepository.save(user);
  }

  /**
   * Ottiene lista di utenti con filtri opzionali
   */
  async getUsers(filters?: { role?: string; company_id?: string }): Promise<User[]> {
    let query = this.userRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.name', 'user.role', 'user.company_id', 'user.created_at']);

    if (filters?.role) {
      query = query.where('user.role = :role', { role: filters.role });
    }

    if (filters?.company_id) {
      query = query.andWhere('user.company_id = :company_id', { company_id: filters.company_id });
    }

    return await query.orderBy('user.created_at', 'DESC').getMany();
  }

  /**
   * Ottiene un utente per ID
   */
  async getUserById(id: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'role', 'company_id', 'created_at'],
    });
  }

  /**
   * Aggiorna un utente
   */
  async updateUser(
    id: string,
    data: Partial<{ name: string; email: string; role: string; company_id: string }>
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('User not found');
    }

    // Se email viene cambiato, verificare unicità
    if (data.email && data.email !== user.email) {
      const existingUser = await this.userRepository.findOne({ where: { email: data.email } });
      if (existingUser) {
        throw new Error('Email already in use');
      }
    }

    // Validazione ruolo se viene modificato
    if (data.role) {
      const validRoles = ['admin', 'backoffice', 'sales_rep'];
      if (!validRoles.includes(data.role)) {
        throw new Error('Invalid role');
      }
    }

    // Aggiorna i campi
    if (data.name !== undefined) user.name = data.name;
    if (data.email !== undefined) user.email = data.email;
    if (data.role !== undefined) user.role = data.role;
    if (data.company_id !== undefined) user.company_id = data.company_id || null;

    return await this.userRepository.save(user);
  }

  /**
   * Cambia password di un utente
   */
  async changePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('User not found');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashedPassword;
    await this.userRepository.save(user);
  }
}
