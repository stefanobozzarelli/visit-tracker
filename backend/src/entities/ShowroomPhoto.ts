import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ShowroomPhotoAlbum } from './ShowroomPhotoAlbum';
import { User } from './User';

@Entity('showroom_photos')
export class ShowroomPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  album_id: string;

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

  @ManyToOne(() => ShowroomPhotoAlbum, album => album.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'album_id' })
  album: ShowroomPhotoAlbum;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
