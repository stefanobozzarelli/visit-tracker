import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './Company';
import { Client } from './Client';

export enum ProjectStatus {
  ATTIVO = 'ATTIVO',
  COMPLETATO = 'COMPLETATO',
  SOSPESO = 'SOSPESO',
  CANCELLATO = 'CANCELLATO',
}

export enum ProjectDevelopment {
  INFO_DAL_CLIENTE = 'INFO DAL CLIENTE',
  RICHIESTA_OFFERTA = 'RICHIESTA OFFERTA',
  OFFERTA_FATTA = 'OFFERTA FATTA',
  ORDINE_CONFERMATO = 'ORDINE CONFERMATO',
  IN_PRODUZIONE = 'IN PRODUZIONE',
  SPEDITO_PARZIALMENTE = 'SPEDITO PARZIALMENTE',
  SPEDITO = 'SPEDITO',
  CONSEGNATO = 'CONSEGNATO',
}

export enum ProjectRegistration {
  INFO_DAL_CLIENTE = 'INFO DAL CLIENTE',
  RICHIESTA_REGISTRAZIONE = 'RICHIESTA REGISTRAZIONE',
  PROGETTO_REGISTRATO = 'PROGETTO REGISTRATO',
  REGISTRAZIONE_RIFIUTATA = 'REGISTRAZIONE RIFIUTATA',
}

export enum ProjectType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', nullable: true })
  project_number: number;

  // Supplier = Company (our companies/suppliers)
  @Column({ nullable: true })
  supplier_id: string;

  @ManyToOne(() => Company, { nullable: true, eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Company;

  // Client (our clients)
  @Column({ nullable: true })
  client_id: string;

  @ManyToOne(() => Client, { nullable: true, eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ nullable: true })
  country: string;

  @Column({ type: 'date', nullable: true })
  registration_date: Date;

  @Column({ nullable: true })
  project_name: string;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.ATTIVO,
  })
  status: ProjectStatus;

  @Column({ nullable: true })
  project_development: string;

  @Column({ nullable: true })
  project_registration: string;

  @Column({ type: 'text', nullable: true })
  project_address: string;

  @Column({ nullable: true })
  project_type: string;

  @Column({ nullable: true })
  detail_of_project_type: string;

  @Column({ nullable: true })
  designated_area: string;

  @Column({ nullable: true })
  architect_designer: string;

  @Column({ nullable: true })
  developer: string;

  @Column({ nullable: true })
  contractor: string;

  @Column({ nullable: true })
  item: string;

  @Column({ nullable: true })
  quantity: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'date', nullable: true })
  estimated_order_date: Date;

  @Column({ type: 'date', nullable: true })
  estimated_delivery_date: Date;

  @Column({ type: 'date', nullable: true })
  estimated_arrival_date: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  project_value: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  total_value_shipped: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
