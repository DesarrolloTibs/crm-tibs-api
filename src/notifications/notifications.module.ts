import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Reminder } from '../reminders/entities/reminder.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { NotificationsController } from './notifications.controller';
import { Ticket } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder, Activity, User, Ticket]),
    MailModule,
    ConfigModule,
  ],
  providers: [NotificationsSchedulerService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
