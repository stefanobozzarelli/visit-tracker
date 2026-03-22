import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Offer } from './Offer';
import { User } from './User';

@Entity('offer_attachments')
export class OfferAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  offer_id: string;

  @Column()
  filename: string;

  @Column()
  file_size: number;

  @Column()
  s3_key: string;

  @Column()
  uploaded_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Offer, offer => offer.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
