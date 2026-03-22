import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from './Client';
import { Company } from './Company';
import { Visit } from './Visit';
import { CompanyVisit } from './CompanyVisit';
import { User } from './User';
import { OfferItem } from './OfferItem';
import { OfferAttachment } from './OfferAttachment';

export enum OfferStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  client_id: string;

  @Column({ nullable: true })
  company_id: string; // supplier

  @Column({ nullable: true })
  visit_id: string; // link to client visit

  @Column({ nullable: true })
  company_visit_id: string; // link to company visit

  @Column({ type: 'date' })
  offer_date: Date;

  @Column({ type: 'date', nullable: true })
  valid_until: Date;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.DRAFT })
  status: OfferStatus;

  @Column({ nullable: true })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_amount: number;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Client, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Visit, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @ManyToOne(() => CompanyVisit, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'company_visit_id' })
  company_visit: CompanyVisit;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => OfferItem, item => item.offer, { cascade: true })
  items: OfferItem[];

  @OneToMany(() => OfferAttachment, att => att.offer, { cascade: true })
  attachments: OfferAttachment[];
}
