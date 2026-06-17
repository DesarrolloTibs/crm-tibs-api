import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { Reminder } from './entities/reminder.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reminder])],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
