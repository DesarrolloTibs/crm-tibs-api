import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto, UpdateCompanyStatusDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const company = this.companyRepository.create(createCompanyDto);
    return this.companyRepository.save(company);
  }

  findAll(): Promise<Company[]> {
    return this.companyRepository.find({
      relations: ['ejecutivo', 'contacts'],
      order: {
        nombre: 'ASC',
      },
    });
  }

  findAllActive(): Promise<Company[]> {
    return this.companyRepository.find({
      where: { estatus: true },
      relations: ['ejecutivo', 'contacts'],
      order: {
        nombre: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['ejecutivo', 'contacts'],
    });
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    const company = await this.companyRepository.preload({
      id: id,
      ...updateCompanyDto,
    });
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return this.companyRepository.save(company);
  }

  async updateStatus(id: string, updateCompanyStatusDto: UpdateCompanyStatusDto): Promise<Company> {
    const company = await this.findOne(id);
    company.estatus = updateCompanyStatusDto.estatus;
    return this.companyRepository.save(company);
  }
}
