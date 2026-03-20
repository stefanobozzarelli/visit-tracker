import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Claim } from './Claim';
import { User } from './User';
import { ClaimMovementAttachment } from './ClaimMovementAttachment';

@Entity('claim_movements')
export class ClaimMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  claim_id: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'text' })
  action: string;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Claim, claim => claim.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claim_id' })
  claim: Claim;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => ClaimMovementAttachment, attachment => attachment.movement, { cascade: true })
  attachments: ClaimMovementAttachment[];
}
