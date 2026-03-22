import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ClientContact } from './ClientContact';
import { Visit } from './Visit';
import { UserPermission } from './UserPermission';
import { ClientCompany } from './ClientCompany';
import { Showroom } from './Showroom';

export enum ClientRole {
  CLIENTE = 'cliente',
  DEVELOPER = 'developer',
  ARCHITETTO_DESIGNER = 'architetto-designer',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({
    type: 'enum',
    enum: ClientRole,
    default: ClientRole.CLIENTE,
  })
  role: ClientRole;

  @Column({ type: 'boolean', default: false })
  has_showroom: boolean;

  @Column({ type: 'int', default: 0 })
  showroom_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ClientContact, contact => contact.client, { cascade: true })
  contacts: ClientContact[];

  @OneToMany(() => Visit, visit => visit.client, { cascade: true })
  visits: Visit[];

  @OneToMany(() => UserPermission, permission => permission.client, { cascade: true })
  permissions: UserPermission[];

  @OneToMany(() => ClientCompany, cc => cc.client, { cascade: true })
  clientCompanies: ClientCompany[];

  @OneToMany(() => Showroom, showroom => showroom.client, { cascade: true })
  showrooms: Showroom[];
}
