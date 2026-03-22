import { AppDataSource } from '../config/database';
import { Client, ClientRole } from '../entities/Client';
import { ClientContact } from '../entities/ClientContact';
import { CreateClientRequest, CreateContactRequest } from '../types';

export class ClientService {
  private clientRepository = AppDataSource.getRepository(Client);
  private contactRepository = AppDataSource.getRepository(ClientContact);

  async createClient(data: CreateClientRequest): Promise<Client> {
    const client = new Client();
    client.name = data.name;
    client.country = data.country;
    client.city = data.city || null;
    client.notes = data.notes || null;
    client.role = (data.role as ClientRole) || ClientRole.CLIENTE;
    client.has_showroom = data.has_showroom || false;
    client.showroom_count = data.showroom_count || 0;
    return await this.clientRepository.save(client);
  }

  async getClients(): Promise<Client[]> {
    return await this.clientRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.contacts', 'contacts')
      .leftJoinAndSelect('client.clientCompanies', 'clientCompanies')
      .leftJoinAndSelect('clientCompanies.company', 'company')
      .orderBy('client.name', 'ASC')
      .getMany();
  }

  async getClientById(id: string): Promise<Client | null> {
    return await this.clientRepository.findOne({
      where: { id },
      relations: ['contacts', 'visits', 'clientCompanies', 'clientCompanies.company'],
    });
  }

  async updateClient(id: string, data: Partial<CreateClientRequest>): Promise<Client> {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.country) updateData.country = data.country;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.role) updateData.role = data.role;
    if (data.has_showroom !== undefined) updateData.has_showroom = data.has_showroom;
    if (data.showroom_count !== undefined) updateData.showroom_count = data.showroom_count;

    await this.clientRepository.update(id, updateData);
    const updated = await this.getClientById(id);
    if (!updated) throw new Error('Client not found');
    return updated;
  }

  async deleteClient(id: string): Promise<void> {
    await this.clientRepository.delete(id);
  }

  async addContact(clientId: string, data: CreateContactRequest): Promise<ClientContact> {
    const contact = this.contactRepository.create({
      ...data,
      client_id: clientId,
    });
    return await this.contactRepository.save(contact);
  }

  async getClientContacts(clientId: string): Promise<ClientContact[]> {
    return await this.contactRepository.find({
      where: { client_id: clientId },
    });
  }

  async updateContact(contactId: string, data: Partial<{ name: string; role: string; email: string; phone: string; wechat: string; notes: string }>): Promise<ClientContact> {
    const contact = await this.contactRepository.findOne({ where: { id: contactId } });
    if (!contact) throw new Error('Contact not found');
    Object.assign(contact, data);
    return await this.contactRepository.save(contact);
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.contactRepository.delete(contactId);
  }
}
