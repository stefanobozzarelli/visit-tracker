import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ClaimMovement } from './ClaimMovement';
import { User } from './User';

@Entity('claim_movement_attachments')
export class ClaimMovementAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  movement_id: string;

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

  // Relations
  @ManyToOne(() => ClaimMovement, movement => movement.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movement_id' })
  movement: ClaimMovement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
