import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique, ForeignKey } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';

@Entity('user_permissions')
@Unique('UNIQUE_user_client_company', ['user_id', 'client_id', 'company_id'])
export class UserPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @Column({ default: true })
  can_view: boolean;

  @Column({ default: false })
  can_create: boolean;

  @Column({ default: false })
  can_edit: boolean;

  @Column()
  assigned_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => User, user => user.permissions)
  user: User;

  @ManyToOne(() => Client, client => client.permissions)
  client: Client;

  @ManyToOne(() => Company, company => company.permissions)
  company: Company;

  @ManyToOne(() => User, user => user.assigned_permissions)
  assigned_by_user: User;
}
