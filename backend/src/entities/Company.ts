import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { VisitReport } from './VisitReport';
import { UserPermission } from './UserPermission';
import { UserCompany } from './UserCompany';
import { ClientCompany } from './ClientCompany';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  country: string;

  @Column({ nullable: true })
  industry: string;

  @Column({ nullable: true })
  rapporto: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => VisitReport, report => report.company)
  reports: VisitReport[];

  @OneToMany(() => UserPermission, permission => permission.company)
  permissions: UserPermission[];

  @OneToMany(() => UserCompany, uc => uc.company)
  userCompanies: UserCompany[];

  @OneToMany(() => ClientCompany, cc => cc.company)
  clientCompanies: ClientCompany[];
}
