import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TodoItem } from './TodoItem';
import { User } from './User';

@Entity('todo_attachments')
export class TodoAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  todo_id: string;

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

  @ManyToOne(() => TodoItem, todo => todo.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo: TodoItem;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
