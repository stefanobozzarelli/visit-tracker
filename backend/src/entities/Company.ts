import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { VisitReport } from './VisitReport';
import { UserPermission } from './UserPermission';

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

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => VisitReport, report => report.company)
  reports: VisitReport[];

  @OneToMany(() => UserPermission, permission => permission.company)
  permissions: UserPermission[];
}
