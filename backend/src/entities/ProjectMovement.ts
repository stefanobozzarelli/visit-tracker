import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Project } from './Project';
import { User } from './User';
import { ProjectMovementAttachment } from './ProjectMovementAttachment';

@Entity('project_movements')
export class ProjectMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  project_id: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'text' })
  action: string;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => ProjectMovementAttachment, attachment => attachment.movement, { cascade: true })
  attachments: ProjectMovementAttachment[];
}
