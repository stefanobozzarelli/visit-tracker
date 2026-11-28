import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './User';

// One leave period of a Primula collaborator (ferie, permesso, malattia...).
// Dates are calendar days (YYYY-MM-DD), end_date inclusive.
@Entity('leave_entries')
@Index(['user_id', 'start_date'])
export class LeaveEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  // ferie | permesso | malattia | trasferta | altro
  @Column({ type: 'varchar', default: 'ferie' })
  type: string;

  // full | am (mattina) | pm (pomeriggio) — half days only for a single day
  @Column({ type: 'varchar', default: 'full' })
  period: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
