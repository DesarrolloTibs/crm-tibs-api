import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunityLabel } from './entities/opportunity-label.entity';

@Injectable()
export class OpportunityLabelsService implements OnModuleInit {
  constructor(
    @InjectRepository(OpportunityLabel)
    private readonly labelRepository: Repository<OpportunityLabel>,
  ) {}

  async onModuleInit() {
    const count = await this.labelRepository.count();
    if (count === 0) {
      await this.labelRepository.insert([
        {
          id: 'f509fa84-0b73-45f8-b3ab-b8471e98822e',
          strname: 'Línea de Negocio',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
        {
          id: '7d90d810-74d3-4613-882d-8e814a029db5',
          strname: 'Tipo de Entrega',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
        {
          id: 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f',
          strname: 'Licenciamiento',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
      ]);
      console.log('Seeded tbloportunitylabels with default labels (UUIDs f509fa84, 7d90d810, c6d3df39)');
    }
  }

  async findAll(): Promise<OpportunityLabel[]> {
    return this.labelRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: string): Promise<OpportunityLabel> {
    const label = await this.labelRepository.findOne({ where: { id } });
    if (!label) {
      throw new NotFoundException(`Etiqueta con ID ${id} no encontrada`);
    }
    return label;
  }

  async update(id: string, strname: string, userId: string): Promise<OpportunityLabel> {
    const label = await this.findOne(id);
    label.strname = strname;
    label.dtmlastmodified = new Date();
    label.uuidlastmodifiedby = userId;
    return this.labelRepository.save(label);
  }
}
