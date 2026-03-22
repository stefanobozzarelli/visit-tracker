import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Offer } from './Offer';
import { Project } from './Project';
import { OfferItemAttachment } from './OfferItemAttachment';

@Entity('offer_items')
export class OfferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  offer_id: string;

  @Column({ nullable: true })
  serie: string;

  @Column({ nullable: true })
  articolo: string;

  @Column({ nullable: true })
  finitura: string;

  @Column({ nullable: true })
  formato: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  spessore_mm: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  prezzo_unitario: number;

  @Column({ nullable: true })
  unita_misura: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  quantita: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_amount: number;

  @Column({ type: 'date', nullable: true })
  data: Date;

  @Column({ default: 'retail' })
  tipo_offerta: string; // 'progetto' | 'retail'

  @Column({ default: false })
  promozionale: boolean;

  @Column({ nullable: true })
  numero_progetto: string;

  @Column({ nullable: true })
  progetto_nome: string;

  @Column({ nullable: true })
  fase_progetto: string;

  @Column({ nullable: true })
  sviluppo_progetto: string;

  @Column({ nullable: true })
  project_id: string; // FK to Project

  @Column({ type: 'date', nullable: true })
  consegna_prevista: Date;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Offer, offer => offer.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToMany(() => OfferItemAttachment, att => att.offer_item, { cascade: true })
  attachments: OfferItemAttachment[];
}
