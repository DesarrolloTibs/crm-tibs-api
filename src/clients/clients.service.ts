import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOptionsWhere, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { Company } from '../companies/entities/company.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto, UpdateClientStatusDto } from './dto/update-client.dto';


@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    let companyId = createClientDto.companyId;

    // Si no tiene companyId pero tiene texto libre en empresa, creamos la empresa
    if (!companyId && createClientDto.empresa) {
      let company = await this.companyRepository.findOne({
        where: { nombre: createClientDto.empresa },
      });

      if (!company) {
        company = this.companyRepository.create({
          nombre: createClientDto.empresa,
          ejecutivo_id: createClientDto.ejecutivo_id,
        });
        company = await this.companyRepository.save(company);
      }
      companyId = company.id;
    }

    const client = this.clientRepository.create({
      ...createClientDto,
      companyId: companyId || null,
    });
    return this.clientRepository.save(client);
  }

  findAll(): Promise<Client[]> {
 
    return this.clientRepository.find({
      relations: ['ejecutivo', 'company'],
      order: {
        empresa: 'ASC',
        nombre: 'ASC',
        apellido: 'ASC',
      },
    });
  }

  findAllActive(): Promise<Client[]> {
    return this.clientRepository.find({ where: { estatus: true }, relations: ['ejecutivo', 'company'] });
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: {id}, relations: ['ejecutivo', 'company'] });

    if (!client) {
      throw new NotFoundException(`Client with ID "${id}" not found`);
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    let companyId = updateClientDto.companyId;

    // Si no tiene companyId pero tiene texto libre en empresa, creamos la empresa
    if (!companyId && updateClientDto.empresa) {
      let company = await this.companyRepository.findOne({
        where: { nombre: updateClientDto.empresa },
      });

      if (!company) {
        company = this.companyRepository.create({
          nombre: updateClientDto.empresa,
          ejecutivo_id: updateClientDto.ejecutivo_id,
        });
        company = await this.companyRepository.save(company);
      }
      companyId = company.id;
    }

    const client = await this.clientRepository.preload({
      id: id,
      ...updateClientDto,
      companyId: companyId !== undefined ? (companyId || null) : undefined,
    });
    if (!client) {
      throw new NotFoundException(`Client with ID "${id}" not found`);
    }
    return this.clientRepository.save(client);
  }

  async updateStatus(id: string, updateClientStatusDto: UpdateClientStatusDto): Promise<Client> {
    const client = await this.findOne(id);
    client.estatus = updateClientStatusDto.estatus;
    return this.clientRepository.save(client);
  }
}