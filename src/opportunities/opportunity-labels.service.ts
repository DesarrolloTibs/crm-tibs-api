import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
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
          field_key: 'linea_negocio',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
        {
          id: '7d90d810-74d3-4613-882d-8e814a029db5',
          strname: 'Tipo de Entrega',
          field_key: 'tipo_entrega',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
        {
          id: 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f',
          strname: 'Licenciamiento',
          field_key: 'licenciamiento',
          blnstatus: true,
          dtmlastmodified: new Date(),
        },
      ]);
      console.log('Seeded tbloportunitylabels with default labels and keys (linea_negocio, tipo_entrega, licenciamiento)');
    } else {
      // Para instalaciones existentes, asegurar de que tengan asignadas sus claves
      const labels = await this.labelRepository.find();
      for (const label of labels) {
        if (!label.field_key) {
          let field_key = '';
          const nameNormalized = (label.strname || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const id = label.id.toLowerCase();
          
          if (id === 'f509fa84-0b73-45f8-b3ab-b8471e98822e' || nameNormalized.includes('negocio') || nameNormalized.includes('linea')) {
            field_key = 'linea_negocio';
          } else if (id === '7d90d810-74d3-4613-882d-8e814a029db5' || nameNormalized.includes('entrega') || nameNormalized.includes('servicio')) {
            field_key = 'tipo_entrega';
          } else if (id === 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f' || nameNormalized.includes('licencia')) {
            field_key = 'licenciamiento';
          }

          if (field_key) {
            label.field_key = field_key;
            await this.labelRepository.save(label);
            console.log(`Updated label "${label.strname}" with key "${field_key}"`);
          }
        }
      }
    }
  }

  async findAll(): Promise<OpportunityLabel[]> {
    return this.labelRepository.find({
      order: { field_key: 'ASC' },
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
    const originalFieldKey = label.field_key;

    // Validar que el nuevo nombre no sea vacío
    if (!strname || !strname.trim()) {
      throw new BadRequestException('El nombre de la etiqueta no puede estar vacío.');
    }

    // Validar que el nombre no esté duplicado con otra etiqueta (en minúsculas e ignorando acentos)
    const duplicate = await this.labelRepository.findOne({
      where: { strname: strname.trim() }
    });
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException('El nombre de la etiqueta ya existe y no puede duplicarse.');
    }

    // Ejecutar la eliminación y la creación en una transacción para evitar inconsistencias
    const savedLabel = await this.labelRepository.manager.transaction(async (manager) => {
      // 1. Eliminar el registro anterior primero para liberar la restricción UNIQUE en 'field_key'
      await manager.delete(OpportunityLabel, id);

      // 2. Crear y guardar el nuevo registro con un nuevo UUID autogenerado
      const newLabel = manager.create(OpportunityLabel, {
        strname: strname.trim(),
        field_key: originalFieldKey,
        blnstatus: true,
        dtmlastmodified: new Date(),
        uuidlastmodifiedby: userId,
      });

      return await manager.save(OpportunityLabel, newLabel);
    });

    console.log(`Wizard update: deleted label ID ${id}, created new label ID ${savedLabel.id} with key "${originalFieldKey}"`);
    return savedLabel;
  }
}
