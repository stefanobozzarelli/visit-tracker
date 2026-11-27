import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from './Company';
import { User } from './User';

export enum PriceListStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * A supplier price list (listino) imported from Excel, CSV or PDF.
 * Each import is kept as its own version: its prices live in article_prices,
 * and articles always show the price of the most recent list.
 */
@Entity('price_lists')
@Index(['company_id', 'valid_from'])
export class PriceList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column()
  name: string;

  // Date the prices start to apply; invoices dated after it use this list's prices
  @Column({ type: 'date', nullable: true })
  valid_from: string | null;

  @Column({ default: 'EUR' })
  currency: string;

  @Column({ type: 'varchar', default: 'excel' })
  source_type: string; // excel | csv | pdf | pdf_ai

  @Column({ type: 'varchar', nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', nullable: true })
  s3_key: string | null;

  @Column({ type: 'varchar', default: PriceListStatus.READY })
  status: string;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  // Rows read from the file / rows saved as articles / rows skipped (no code or no price)
  @Column({ default: 0 })
  rows_read: number;

  @Column({ default: 0 })
  article_count: number;

  @Column({ default: 0 })
  rows_skipped: number;

  // Progress for background (AI) imports, 0-100
  @Column({ default: 100 })
  progress: number;

  // Column mapping used for the import, so the next list from the same supplier can reuse it
  @Column({ type: 'jsonb', nullable: true })
  column_mapping: any;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by_user_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
