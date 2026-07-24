import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunityLabel } from './entities/opportunity-label.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class OpportunityLabelsService implements OnModuleInit {
  constructor(
    @InjectRepository(OpportunityLabel)
    private readonly labelRepository: Repository<OpportunityLabel>,
  ) {}

  private async ensureTableExists() {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    try {
      await this.labelRepository.manager.query(`
        CREATE TABLE IF NOT EXISTS "${tenantSchema}".tbloportunitylabels (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NULL,
          field_key varchar(50) NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmlastmodified timestamptz NULL DEFAULT now(),
          uuidlastmodifiedby uuid NULL,
          CONSTRAINT pk_tbloportunitylabels PRIMARY KEY (id)
        );

        ALTER TABLE "${tenantSchema}".tbloportunitylabels ADD COLUMN IF NOT EXISTS uuidlastmodifiedby uuid NULL;
        ALTER TABLE "${tenantSchema}".tbloportunitylabels ADD COLUMN IF NOT EXISTS dtmlastmodified timestamptz NULL DEFAULT now();
        ALTER TABLE "${tenantSchema}".tbloportunitylabels ADD COLUMN IF NOT EXISTS field_key varchar(50) NULL;

        INSERT INTO "${tenantSchema}".tbloportunitylabels (id, strname, field_key, blnstatus) VALUES
          ('f509fa84-0b73-45f8-b3ab-b8471e98822e', 'Línea de Negocio', 'linea_negocio', true),
          ('7d90d810-74d3-4613-882d-8e814a029db5', 'Tipo de Entrega', 'tipo_entrega', true),
          ('c6d3df39-53e7-40b9-8e2b-f1de16b5394f', 'Licenciamiento', 'licenciamiento', true)
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (e) {}
  }

  async onModuleInit() {
    await this.ensureTableExists();

    try {
      const count = await this.labelRepository.count().catch(() => 0);

      if (count > 0) {
        // Para instalaciones existentes, asegurar de que tengan asignadas sus claves
        const labels = await this.labelRepository.find().catch(() => []);
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
              await this.labelRepository.save(label).catch(() => null);
            }
          }
        }
      }
    } catch (e) {}
  }

  async findAll(): Promise<OpportunityLabel[]> {
    await this.ensureTableExists();
    return this.labelRepository.find({
      order: { field_key: 'ASC' },
    }).catch(async () => {
      await this.ensureTableExists();
      return this.labelRepository.find({ order: { field_key: 'ASC' } });
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
