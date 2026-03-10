import { AppDataSource } from '../config/database';
import { Company } from '../entities/Company';
import { CreateCompanyRequest } from '../types';

export class CompanyService {
  private companyRepository = AppDataSource.getRepository(Company);

  async createCompany(data: CreateCompanyRequest): Promise<Company> {
    const company = this.companyRepository.create(data);
    return await this.companyRepository.save(company);
  }

  async getCompanies(): Promise<Company[]> {
    return await this.companyRepository
      .createQueryBuilder('company')
      .orderBy('company.name', 'ASC')
      .getMany();
  }

  async getCompanyById(id: string): Promise<Company | null> {
    return await this.companyRepository.findOne({
      where: { id },
    });
  }

  async updateCompany(id: string, data: Partial<CreateCompanyRequest>): Promise<Company> {
    await this.companyRepository.update(id, data);
    const updated = await this.getCompanyById(id);
    if (!updated) throw new Error('Company not found');
    return updated;
  }

  async deleteCompany(id: string): Promise<void> {
    await this.companyRepository.delete(id);
  }
}
