import { AppDataSource } from '../config/database';
import { Showroom } from '../entities/Showroom';
import { ShowroomPhotoAlbum } from '../entities/ShowroomPhotoAlbum';
import { ShowroomPhoto } from '../entities/ShowroomPhoto';

export class ShowroomService {
  private showroomRepo = AppDataSource.getRepository(Showroom);
  private albumRepo = AppDataSource.getRepository(ShowroomPhotoAlbum);
  private photoRepo = AppDataSource.getRepository(ShowroomPhoto);

  // CRUD Showroom
  async createShowroom(data: any) {
    const showroom = this.showroomRepo.create(data);
    return this.showroomRepo.save(showroom);
  }

  async getShowrooms(filters?: { client_id?: string; company_id?: string; status?: string; area?: string; city?: string }) {
    const qb = this.showroomRepo.createQueryBuilder('s')
      .leftJoinAndSelect('s.client', 'client')
      .leftJoinAndSelect('s.company', 'company')
      .leftJoinAndSelect('s.albums', 'albums')
      .leftJoinAndSelect('albums.photos', 'photos')
      .orderBy('s.created_at', 'DESC');

    if (filters?.client_id) qb.andWhere('s.client_id = :clientId', { clientId: filters.client_id });
    if (filters?.company_id) qb.andWhere('s.company_id = :companyId', { companyId: filters.company_id });
    if (filters?.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters?.area) qb.andWhere('s.area = :area', { area: filters.area });
    if (filters?.city) qb.andWhere('LOWER(s.city) LIKE LOWER(:city)', { city: `%${filters.city}%` });

    return qb.getMany();
  }

  async getShowroomById(id: string) {
    return this.showroomRepo.findOne({
      where: { id },
      relations: ['client', 'company', 'created_by_user', 'albums', 'albums.photos', 'albums.photos.uploaded_by_user'],
    });
  }

  async updateShowroom(id: string, data: any) {
    await this.showroomRepo.update(id, data);
    return this.getShowroomById(id);
  }

  async deleteShowroom(id: string) {
    return this.showroomRepo.delete(id);
  }

  // CRUD Album
  async createAlbum(data: any) {
    const album = this.albumRepo.create(data);
    return this.albumRepo.save(album);
  }

  async getAlbums(showroomId: string) {
    return this.albumRepo.find({
      where: { showroom_id: showroomId },
      relations: ['photos', 'photos.uploaded_by_user', 'created_by_user'],
      order: { date: 'DESC' },
    });
  }

  async getAlbumById(albumId: string) {
    return this.albumRepo.findOne({
      where: { id: albumId },
      relations: ['photos', 'photos.uploaded_by_user', 'created_by_user'],
    });
  }

  async updateAlbum(albumId: string, data: any) {
    await this.albumRepo.update(albumId, data);
    return this.getAlbumById(albumId);
  }

  async deleteAlbum(albumId: string) {
    return this.albumRepo.delete(albumId);
  }

  // CRUD Photo
  async addPhoto(data: { album_id: string; filename: string; file_size: number; s3_key: string; uploaded_by_user_id: string }) {
    const photo = this.photoRepo.create(data);
    return this.photoRepo.save(photo);
  }

  async getPhoto(photoId: string) {
    return this.photoRepo.findOne({ where: { id: photoId } });
  }

  async deletePhoto(photoId: string) {
    return this.photoRepo.delete(photoId);
  }
}
