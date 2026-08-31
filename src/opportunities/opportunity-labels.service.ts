import { Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunityLabel } from './entities/opportunity-label.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class OpportunityLabelsService implements OnModuleInit {
  private readonly logger = new Logger('OpportunityLabelsService');

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

        -- Insertar valores iniciales solo si no existe ya un registro para cada field_key
        INSERT INTO "${tenantSchema}".tbloportunitylabels (id, strname, field_key, blnstatus)
        SELECT 'f509fa84-0b73-45f8-b3ab-b8471e98822e', 'Línea de Negocio', 'linea_negocio', true
        WHERE NOT EXISTS (SELECT 1 FROM "${tenantSchema}".tbloportunitylabels WHERE field_key = 'linea_negocio');

        INSERT INTO "${tenantSchema}".tbloportunitylabels (id, strname, field_key, blnstatus)
        SELECT '7d90d810-74d3-4613-882d-8e814a029db5', 'Tipo de Entrega', 'tipo_entrega', true
        WHERE NOT EXISTS (SELECT 1 FROM "${tenantSchema}".tbloportunitylabels WHERE field_key = 'tipo_entrega');

        INSERT INTO "${tenantSchema}".tbloportunitylabels (id, strname, field_key, blnstatus)
        SELECT 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f', 'Licenciamiento', 'licenciamiento', true
        WHERE NOT EXISTS (SELECT 1 FROM "${tenantSchema}".tbloportunitylabels WHERE field_key = 'licenciamiento');
      `);
    } catch (e) {}
  }

  async onModuleInit() {
    await this.ensureTableExists();

    try {
      const labels = await this.labelRepository.find({ order: { dtmlastmodified: 'DESC' } }).catch(() => []);
      const seenKeys = new Set<string>();

      for (const label of labels) {
        // Asegurar que field_key esté asignado
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

        // Limpieza de duplicados históricos dejando el más recientemente modificado
        if (label.field_key) {
          if (seenKeys.has(label.field_key)) {
            await this.labelRepository.delete(label.id).catch(() => null);
          } else {
            seenKeys.add(label.field_key);
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

  /**
   * Actualiza el nombre de una etiqueta de oportunidad existente en su lugar (in-place).
   * Mantiene el mismo ID y field_key sin insertar nuevos registros.
   */
  async update(id: string, strname: string, userId: string): Promise<OpportunityLabel> {
    const label = await this.findOne(id);

    // Validar que el nuevo nombre no sea vacío
    if (!strname || !strname.trim()) {
      throw new BadRequestException('El nombre de la etiqueta no puede estar vacío.');
    }

    const trimmedName = strname.trim();

    // Validar que el nombre no esté duplicado con otra etiqueta activa distinta
    const duplicate = await this.labelRepository.findOne({
      where: { strname: trimmedName }
    });
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException('El nombre de la etiqueta ya existe y no puede duplicarse.');
    }

    // Actualización directa in-place manteniendo el ID original
    label.strname = trimmedName;
    label.dtmlastmodified = new Date();
    label.uuidlastmodifiedby = userId;

    const savedLabel = await this.labelRepository.save(label);
    this.logger.log(`Etiqueta actualizada exitosamente: ID ${savedLabel.id}, clave "${savedLabel.field_key}", nuevo nombre "${savedLabel.strname}"`);
    return savedLabel;
  }
}
