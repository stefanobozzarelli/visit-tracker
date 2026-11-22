import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Tracks per-admin copies of VT tasks pushed to an admin's Todoist account. */
@Entity('todoist_admin_tasks')
@Index(['todo_id', 'admin_user_id'], { unique: true })
@Index(['todoist_task_id'])
export class TodoistAdminTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  todo_id: string;

  @Column()
  admin_user_id: string;

  @Column({ nullable: true })
  todoist_task_id: string;

  @CreateDateColumn()
  created_at: Date;
}
