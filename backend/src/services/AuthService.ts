import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AuthPayload, LoginRequest, RegisterRequest } from '../types';
import { getJwtSecret } from '../config/jwtSecret';

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);

  async register(data: RegisterRequest): Promise<{ user: User; token: string }> {
    const existingUser = await this.userRepository.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = this.userRepository.create({
      email: data.email,
      name: data.name,
      password_hash: hashedPassword,
      role: data.role || 'sales_rep',
    });

    await this.userRepository.save(user);
    const token = this.generateToken(user);

    return { user, token };
  }

  async login(data: LoginRequest): Promise<{ user: User; token: string }> {
    // password_hash è select: false → va richiesto esplicitamente
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.email = :email', { email: data.email })
      .getOne();
    // Same message whether the email or the password is wrong, so the login
    // form cannot be used to find out which emails have an account.
    if (!user || !data.password) {
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateToken(user);
    return { user, token };
  }

  generateToken(user: User): string {
    const payload: AuthPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      can_view_revenue: !!(user as any).can_view_revenue,
    };

    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRY || '24h';

    return jwt.sign(payload, secret, { expiresIn } as any);
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  verifyToken(token: string): AuthPayload {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as AuthPayload;
  }
}
