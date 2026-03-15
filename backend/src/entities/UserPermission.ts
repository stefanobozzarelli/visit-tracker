import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique, ForeignKey, JoinColumn } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';

@Entity('user_permissions')
@Unique('UNIQUE_user_client_company', ['user_id', 'client_id', 'company_id'])
export class UserPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @ForeignKey(() => User)
  user_id: string;

  @Column()
  @ForeignKey(() => Client)
  client_id: string;

  @Column()
  @ForeignKey(() => Company)
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
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Client, client => client.permissions)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, company => company.permissions)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, user => user.assigned_permissions)
  @JoinColumn({ name: 'assigned_by_user_id' })
  assigned_by_user: User;
}
