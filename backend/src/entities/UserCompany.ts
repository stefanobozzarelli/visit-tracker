import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from './User';
import { Company } from './Company';

@Entity('user_companies')
@Unique('UQ_user_company', ['user_id', 'company_id'])
export class UserCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  assigned_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.userCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Company, company => company.userCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by_user_id' })
  assigned_by_user: User;
}
