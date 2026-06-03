import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ProjectMovement } from './ProjectMovement';
import { User } from './User';

@Entity('project_movement_attachments')
export class ProjectMovementAttachment {
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
  @ManyToOne(() => ProjectMovement, movement => movement.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movement_id' })
  movement: ProjectMovement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
