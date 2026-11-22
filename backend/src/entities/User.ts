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

  // select: false → mai incluso in query/join (es. todo.assigned_to_user); leggere con addSelect
  @Column({ select: false })
  password_hash: string;

  @Column({ type: 'enum', enum: ['master_admin', 'admin', 'manager', 'sales_rep'], default: 'sales_rep' })
  role: string;

  @Column({ default: false })
  can_view_revenue: boolean;

  @Column({ nullable: true })
  company_id: string;

  @Column({ type: 'simple-json', nullable: true })
  sidebar_menu_order: string[] | null;

  // Microsoft 365 / Outlook OAuth (per creare bozze con allegato via Graph)
  // Token segreti: select: false (vedi MicrosoftGraphService.loadUserWithTokens)
  @Column({ type: 'text', nullable: true, select: false })
  ms_refresh_token: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  ms_access_token: string | null;

  // epoch ms di scadenza dell'access token
  @Column({ type: 'bigint', nullable: true, select: false })
  ms_token_expiry: string | null;

  @Column({ type: 'text', nullable: true })
  ms_email: string | null;

  // Todoist OAuth (sincronizzazione bidirezionale dei task)
  // select: false → mai incluso nelle query/join (es. todo.assigned_to_user); va letto con addSelect
  @Column({ type: 'text', nullable: true, select: false })
  todoist_access_token: string | null;

  @Column({ type: 'text', nullable: true })
  todoist_user_id: string | null;

  @Column({ type: 'text', nullable: true })
  todoist_email: string | null;

  // { [category]: todoist project id } — progetti "Visit Tracker" creati nel Todoist dell'utente
  @Column({ type: 'simple-json', nullable: true })
  todoist_project_ids: Record<string, string> | null;

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
