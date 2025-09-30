import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Reminder } from './entities/reminder.entity';

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepository: Repository<Reminder>,
  ) {}

  create(createReminderDto: CreateReminderDto): Promise<Reminder> {
    const reminder = this.reminderRepository.create(createReminderDto);
    return this.reminderRepository.save(reminder);
  }

  findAllByOpportunity(opportunityId: string): Promise<Reminder[]> {
    return this.reminderRepository.find({
      where: { opportunity_id: opportunityId },
      order: { date: 'ASC' },
    });
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