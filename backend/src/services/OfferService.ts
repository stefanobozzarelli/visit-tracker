import { AppDataSource } from '../config/database';
import { Offer } from '../entities/Offer';
import { OfferItem } from '../entities/OfferItem';
import { OfferAttachment } from '../entities/OfferAttachment';
import { OfferItemAttachment } from '../entities/OfferItemAttachment';

export class OfferService {
  private offerRepo = AppDataSource.getRepository(Offer);
  private itemRepo = AppDataSource.getRepository(OfferItem);
  private attachmentRepo = AppDataSource.getRepository(OfferAttachment);
  private itemAttachmentRepo = AppDataSource.getRepository(OfferItemAttachment);

  async createOffer(data: any): Promise<Offer> {
    const offer = this.offerRepo.create(data);
    return this.offerRepo.save(offer) as unknown as Promise<Offer>;
  }

  async getOffers(filters?: { client_id?: string; company_id?: string; status?: string; tipo_offerta?: string }): Promise<Offer[]> {
    const qb = this.offerRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.client', 'client')
      .leftJoinAndSelect('o.company', 'company')
      .leftJoinAndSelect('o.visit', 'visit')
      .leftJoinAndSelect('o.company_visit', 'company_visit')
      .leftJoinAndSelect('o.project', 'project')
      .leftJoinAndSelect('o.created_by_user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .orderBy('o.created_at', 'DESC');

    if (filters?.client_id) qb.andWhere('o.client_id = :clientId', { clientId: filters.client_id });
    if (filters?.company_id) qb.andWhere('o.company_id = :companyId', { companyId: filters.company_id });
    if (filters?.status) qb.andWhere('o.status = :status', { status: filters.status });

    return qb.getMany();
  }

  async getOfferById(id: string): Promise<Offer | null> {
    return this.offerRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.client', 'client')
      .leftJoinAndSelect('o.company', 'company')
      .leftJoinAndSelect('o.visit', 'visit')
      .leftJoinAndSelect('o.visit.client', 'visit_client')
      .leftJoinAndSelect('o.company_visit', 'company_visit')
      .leftJoinAndSelect('o.company_visit.company', 'cv_company')
      .leftJoinAndSelect('o.project', 'project')
      .leftJoinAndSelect('o.created_by_user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.project', 'project')
      .leftJoinAndSelect('items.attachments', 'item_attachments')
      .leftJoinAndSelect('item_attachments.uploaded_by_user', 'item_att_user')
      .leftJoinAndSelect('o.attachments', 'attachments')
      .leftJoinAndSelect('attachments.uploaded_by_user', 'att_user')
      .where('o.id = :id', { id })
      .getOne();
  }

  async updateOffer(id: string, data: any): Promise<Offer> {
    await this.offerRepo.update(id, data);
    return this.getOfferById(id) as Promise<Offer>;
  }

  async deleteOffer(id: string): Promise<void> {
    await this.offerRepo.delete(id);
  }

  // Items
  async addItem(offerId: string, data: any): Promise<OfferItem> {
    const item = this.itemRepo.create({ ...data, offer_id: offerId });
    return this.itemRepo.save(item) as unknown as Promise<OfferItem>;
  }

  async updateItem(itemId: string, data: any): Promise<void> {
    await this.itemRepo.update(itemId, data);
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.itemRepo.delete(itemId);
  }

  // Offer Attachments
  async addAttachment(offerId: string, data: { filename: string; file_size: number; s3_key: string; uploaded_by_user_id: string }): Promise<OfferAttachment> {
    const att = this.attachmentRepo.create({ ...data, offer_id: offerId });
    return this.attachmentRepo.save(att) as unknown as Promise<OfferAttachment>;
  }

  async getAttachment(id: string): Promise<OfferAttachment | null> {
    return this.attachmentRepo.findOne({ where: { id } });
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.attachmentRepo.delete(id);
  }

  // Item Attachments
  async addItemAttachment(itemId: string, data: { filename: string; file_size: number; s3_key: string; uploaded_by_user_id: string }): Promise<OfferItemAttachment> {
    const att = this.itemAttachmentRepo.create({ ...data, offer_item_id: itemId });
    return this.itemAttachmentRepo.save(att) as unknown as Promise<OfferItemAttachment>;
  }

  async getItemAttachment(id: string): Promise<OfferItemAttachment | null> {
    return this.itemAttachmentRepo.findOne({ where: { id } });
  }

  async deleteItemAttachment(id: string): Promise<void> {
    await this.itemAttachmentRepo.delete(id);
  }

  // Recalculate total
  async recalculateTotal(offerId: string): Promise<void> {
    const items = await this.itemRepo.find({ where: { offer_id: offerId } });
    const total = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    await this.offerRepo.update(offerId, { total_amount: total });
  }
}
