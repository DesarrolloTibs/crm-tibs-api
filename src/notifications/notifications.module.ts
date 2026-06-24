import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Reminder } from '../reminders/entities/reminder.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { NotificationsController } from './notifications.controller';
import { Ticket } from '../tickets/entities/ticket.entity';
import { HelpdeskCronConfig } from '../tickets/entities/helpdesk-cron-config.entity';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder, Activity, User, Ticket, HelpdeskCronConfig]),
    MailModule,
    ConfigModule,
    forwardRef(() => TicketsModule),
  ],
  providers: [NotificationsSchedulerService],
  controllers: [NotificationsController],
  exports: [NotificationsSchedulerService],
})
export class NotificationsModule {}

