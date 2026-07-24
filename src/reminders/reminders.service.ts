import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Reminder } from './entities/reminder.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepository: Repository<Reminder>,
  ) {}

  private async ensureTableExists() {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    try {
      await this.reminderRepository.query(`
        CREATE TABLE IF NOT EXISTS "${tenantSchema}".reminders (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          title varchar(255) NULL,
          date timestamptz NULL,
          notified boolean NOT NULL DEFAULT false,
          activity_id uuid NULL,
          CONSTRAINT pk_reminders PRIMARY KEY (id)
        );

        ALTER TABLE "${tenantSchema}".reminders ADD COLUMN IF NOT EXISTS "title" varchar(255);
        ALTER TABLE "${tenantSchema}".reminders ADD COLUMN IF NOT EXISTS "date" timestamptz;
        ALTER TABLE "${tenantSchema}".reminders ADD COLUMN IF NOT EXISTS "notified" boolean DEFAULT false;
        ALTER TABLE "${tenantSchema}".reminders ADD COLUMN IF NOT EXISTS "activity_id" uuid;
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = '${tenantSchema}' AND table_name = 'reminders' AND column_name = 'reminder_date'
          ) THEN
            ALTER TABLE "${tenantSchema}".reminders ALTER COLUMN "reminder_date" DROP NOT NULL;
          END IF;
        END $$;
      `);
    } catch (e) {}
  }


  async create(createReminderDto: CreateReminderDto): Promise<Reminder> {
    await this.ensureTableExists();
    const reminder = this.reminderRepository.create(createReminderDto);
    return this.reminderRepository.save(reminder);
  }

  async findByActivity(activityId: string): Promise<Reminder | null> {
    await this.ensureTableExists();
    return this.reminderRepository.findOne({ where: { activityId } });
  }

  async upsertForActivity(
    activityId: string,
    data: { title: string; date: string },
  ): Promise<Reminder> {
    await this.ensureTableExists();
    const existing = await this.reminderRepository.findOne({
      where: { activityId },
    });

    if (existing) {
      if (existing.notified) {
        // Si ya fue notificado, omitimos la actualización para no interferir con cambios en el resto de la actividad
        return existing;
      }
      existing.title = data.title;
      existing.date = new Date(data.date);
      return this.reminderRepository.save(existing);
    }

    const reminder = this.reminderRepository.create({
      title: data.title,
      date: new Date(data.date),
      activityId,
    });
    return this.reminderRepository.save(reminder);
  }


  async deleteByActivity(activityId: string): Promise<void> {
    const existing = await this.reminderRepository.findOne({ where: { activityId } });
    if (existing && existing.notified) {
      // Omitir eliminación si ya fue notificado
      return;
    }
    await this.reminderRepository.delete({ activityId });
  }

  async findOne(id: string): Promise<Reminder> {
    const reminder = await this.reminderRepository.findOne({ where: { id } });
    if (!reminder) {
      throw new NotFoundException(`Reminder with ID "${id}" not found`);
    }
    return reminder;
  }

  async update(id: string, updateReminderDto: UpdateReminderDto): Promise<Reminder> {
    const reminder = await this.reminderRepository.preload({
      id: id,
      ...updateReminderDto,
    });
    if (!reminder) {
      throw new NotFoundException(`Reminder with ID "${id}" not found`);
    }
    return this.reminderRepository.save(reminder);
  }

  async remove(id: string): Promise<void> {
    const result = await this.reminderRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Reminder with ID "${id}" not found`);
    }
  }
}