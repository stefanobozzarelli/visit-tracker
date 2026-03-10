import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AuthPayload, LoginRequest, RegisterRequest } from '../types';

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
    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    const token = this.generateToken(user);
    return { user, token };
  }

  generateToken(user: User): string {
    const payload: AuthPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const secret = process.env.JWT_SECRET || 'your_secret';
    const expiresIn = process.env.JWT_EXPIRY || '24h';

    return jwt.sign(payload, secret, { expiresIn } as any);
  }

  verifyToken(token: string): AuthPayload {
    const secret = process.env.JWT_SECRET || 'your_secret';
    return jwt.verify(token, secret) as AuthPayload;
  }
}
