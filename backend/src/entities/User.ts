import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Visit } from './Visit';
import { VisitAttachment } from './VisitAttachment';
import { UserPermission } from './UserPermission';

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

  @Column({ type: 'enum', enum: ['admin', 'manager', 'sales_rep'], default: 'sales_rep' })
  role: string;

  @Column({ nullable: true })
  company_id: string;

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
}
