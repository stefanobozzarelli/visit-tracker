import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Visit } from './Visit';
import { VisitAttachment } from './VisitAttachment';
import { UserPermission } from './UserPermission';
import { UserCompany } from './UserCompany';
import { UserCountry } from './UserCountry';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  password_hash: string;

  @Column({ type: 'enum', enum: ['master_admin', 'admin', 'manager', 'sales_rep'], default: 'sales_rep' })
  role: string;

  @Column({ default: false })
  can_view_revenue: boolean;

  @Column({ nullable: true })
  company_id: string;

  @Column({ type: 'simple-json', nullable: true })
  sidebar_menu_order: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Visit, visit => visit.visited_by_user)
  visits: Visit[];

  @OneToMany(() => VisitAttachment, attachment => attachment.uploaded_by_user)
  attachments: VisitAttachment[];

  @OneToMany(() => UserPermission, permission => permission.user)
  permissions: UserPermission[];

  @OneToMany(() => UserPermission, permission => permission.assigned_by_user)
  assigned_permissions: UserPermission[];

  @OneToMany(() => UserCompany, uc => uc.user, { cascade: true })
  userCompanies: UserCompany[];

  @OneToMany(() => UserCountry, uc => uc.user, { cascade: true })
  userCountries: UserCountry[];
}
