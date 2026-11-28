import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from './Company';
import { PriceList } from './PriceList';

/**
 * One article of a supplier (azienda), identified by the supplier's own code.
 * Invoice lines are matched on match_code (upper case, no spaces/dots/dashes/
 * slashes/underscores), then on alt_code and base_code.
 */
@Entity('articles')
@Index('idx_articles_company_code', ['company_id', 'normalized_code'], { unique: true })
@Index('idx_articles_company_match', ['company_id', 'match_code'])
@Index('idx_articles_company_base', ['company_id', 'base_code'])
@Index('idx_articles_company_alt', ['company_id', 'alt_code'])
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column()
  code: string;

  // Unique key: match_code, plus "#internal code" when the same invoice code
  // repeats on several rows of the list
  @Column()
  normalized_code: string;

  // Normalized code as printed on invoices (code + version, e.g. LEMUD1111986)
  @Column({ type: 'varchar', nullable: true })
  match_code: string | null;

  // Normalized code without the version (LEMUD111198)
  @Column({ type: 'varchar', nullable: true })
  base_code: string | null;

  // Normalized internal code of the supplier, when the list has one
  @Column({ type: 'varchar', nullable: true })
  alt_code: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  // Price from the most recent price list that contains the article
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  list_price: number | null;

  @Column({ type: 'uuid', nullable: true })
  price_list_id: string | null;

  // Created by hand from a code found on invoices, not from a price list
  // (e.g. an old version no longer in the list). Kept when lists are removed.
  @Column({ type: 'boolean', default: false })
  manual: boolean;

  // No longer produced
  @Column({ type: 'boolean', default: false })
  discontinued: boolean;

  // The article that replaces this one, if any
  @Column({ type: 'uuid', nullable: true })
  replaced_by_id: string | null;

  // Other columns of the price list (collection, size, pieces per box, ...)
  @Column({ type: 'jsonb', nullable: true })
  extra: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Article, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by_id' })
  replaced_by: Article | null;

  @ManyToOne(() => PriceList, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'price_list_id' })
  price_list: PriceList;
}
