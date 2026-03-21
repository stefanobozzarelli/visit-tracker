import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Client } from './Client';
import { Company } from './Company';

@Entity('client_companies')
@Unique('UQ_client_company', ['client_id', 'company_id'])
export class ClientCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Client, client => client.clientCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, company => company.clientCompanies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
