import { Injectable, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessLineOption } from './entities/business-line-option.entity';
import { DeliveryTypeOption } from './entities/delivery-type-option.entity';
import { LicensingOption } from './entities/licensing-option.entity';
import { Opportunity } from './entities/opportunity.entity';

export type CatalogType = 'business-lines' | 'delivery-types' | 'licensings';

@Injectable()
export class OpportunityCatalogsService implements OnModuleInit {
  constructor(
    @InjectRepository(BusinessLineOption)
    private readonly businessLineRepository: Repository<BusinessLineOption>,
    @InjectRepository(DeliveryTypeOption)
    private readonly deliveryTypeRepository: Repository<DeliveryTypeOption>,
    @InjectRepository(LicensingOption)
    private readonly licensingRepository: Repository<LicensingOption>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async onModuleInit() {
    // 1. Seed BusinessLineOption
    const blCount = await this.businessLineRepository.count();
    if (blCount === 0) {
      await this.businessLineRepository.insert([
        { id: 'a8b6d804-94c9-4a0b-bc77-cfc8152e93db', strname: 'Datos', blnstatus: true },
        { id: 'b2f0a149-14a0-410a-8bf8-28564f7b60cc', strname: 'Desarrollo', blnstatus: true },
        { id: 'c5d72bc1-12c8-47bc-8a7e-128a192bfa77', strname: 'RH', blnstatus: true },
      ]);
      console.log('Seeded tblbusinesslines with default options.');
    }

    // 2. Seed DeliveryTypeOption
    const dtCount = await this.deliveryTypeRepository.count();
    if (dtCount === 0) {
      await this.deliveryTypeRepository.insert([
        { id: 'd29ab9f7-7b89-4089-a299-cf9b0cb617cf', strname: 'Proyecto', blnstatus: true },
        { id: 'e20c3a2a-43d9-482a-88cb-b09b0b4b2efc', strname: 'Licencia', blnstatus: true },
        { id: 'f22db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'Asignacion', blnstatus: true },
        { id: '012db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'Bolsa de Horas', blnstatus: true },
      ]);
      console.log('Seeded tbldeliverytypes with default options.');
    }

    // 3. Seed LicensingOption
    const lCount = await this.licensingRepository.count();
    if (lCount === 0) {
      await this.licensingRepository.insert([
        { id: '112db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'No Aplica', blnstatus: true },
        { id: '212db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'Microsoft', blnstatus: true },
        { id: '312db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'IBM', blnstatus: true },
        { id: '412db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'Qlik', blnstatus: true },
        { id: '512db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'Alteryx', blnstatus: true },
        { id: '612db2a2-4a08-410a-ba8c-b01b0b5b2efc', strname: 'KNIME', blnstatus: true },
      ]);
      console.log('Seeded tblicensings with default options.');
    }
  }

  private getRepository(type: CatalogType): Repository<any> {
    switch (type) {
      case 'business-lines':
        return this.businessLineRepository;
      case 'delivery-types':
        return this.deliveryTypeRepository;
      case 'licensings':
        return this.licensingRepository;
      default:
        throw new BadRequestException(`Catalog type "${type}" not supported.`);
    }
  }

  async findAll(type: CatalogType): Promise<any[]> {
    const repo = this.getRepository(type);
    const options = await repo.find({ order: { strname: 'ASC' } });
    
    return Promise.all(
      options.map(async (option) => {
        let opportunitiesList: { id: string; nombre_proyecto: string }[] = [];
        if (type === 'business-lines') {
          opportunitiesList = await this.opportunityRepository.find({
            select: ['id', 'nombre_proyecto'],
            where: { linea_negocio_id: option.id }
          });
        } else if (type === 'delivery-types') {
          opportunitiesList = await this.opportunityRepository.find({
            select: ['id', 'nombre_proyecto'],
            where: { tipo_entrega_id: option.id }
          });
        } else if (type === 'licensings') {
          opportunitiesList = await this.opportunityRepository.find({
            select: ['id', 'nombre_proyecto'],
            where: { licenciamiento_id: option.id }
          });
        }
        return {
          ...option,
          isUsed: opportunitiesList.length > 0,
          opportunities: opportunitiesList,
        };
      })
    );
  }

  async findAllActive(type: CatalogType): Promise<any[]> {
    const repo = this.getRepository(type);
    return repo.find({ where: { blnstatus: true }, order: { strname: 'ASC' } });
  }

  async findOne(type: CatalogType, id: string): Promise<any> {
    const repo = this.getRepository(type);
    const option = await repo.findOne({ where: { id } });
    if (!option) {
      throw new NotFoundException(`Option with ID ${id} not found in catalog ${type}`);
    }
    return option;
  }

  async create(type: CatalogType, strname: string): Promise<any> {
    const repo = this.getRepository(type);
    
    // Check for duplicate names (case-insensitive)
    const existing = await repo.findOne({ where: { strname } });
    if (existing) {
      throw new BadRequestException(`Ya existe una opción con el nombre "${strname}" en este catálogo.`);
    }

    const newOption = repo.create({ strname, blnstatus: true });
    return repo.save(newOption);
  }

  async update(type: CatalogType, id: string, strname?: string, blnstatus?: boolean): Promise<any> {
    const repo = this.getRepository(type);
    const option = await this.findOne(type, id);

    if (strname !== undefined) {
      const nameTrimmed = strname.trim();
      if (nameTrimmed.toLowerCase() !== option.strname.toLowerCase()) {
        const existing = await repo.findOne({ where: { strname: nameTrimmed } });
        if (existing) {
          throw new BadRequestException(`Ya existe una opción con el nombre "${nameTrimmed}" en este catálogo.`);
        }
      }
      option.strname = nameTrimmed;
    }

    if (blnstatus !== undefined) {
      option.blnstatus = blnstatus;
    }

    return repo.save(option);
  }

  async remove(type: CatalogType, id: string): Promise<{ success: boolean }> {
    const repo = this.getRepository(type);
    const option = await this.findOne(type, id);

    let isUsed = false;
    if (type === 'business-lines') {
      isUsed = await this.opportunityRepository.exist({ where: { linea_negocio_id: id } });
    } else if (type === 'delivery-types') {
      isUsed = await this.opportunityRepository.exist({ where: { tipo_entrega_id: id } });
    } else if (type === 'licensings') {
      isUsed = await this.opportunityRepository.exist({ where: { licenciamiento_id: id } });
    }

    if (isUsed) {
      throw new BadRequestException(
        'No se puede eliminar esta opción porque está asociada a oportunidades existentes. Desactívala en su lugar.'
      );
    }

    await repo.remove(option);
    return { success: true };
  }
}
