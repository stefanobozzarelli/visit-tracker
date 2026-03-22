import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { OfferItem } from './OfferItem';
import { User } from './User';

@Entity('offer_item_attachments')
export class OfferItemAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  offer_item_id: string;

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

  @ManyToOne(() => OfferItem, item => item.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_item_id' })
  offer_item: OfferItem;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
