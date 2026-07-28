import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Reminder } from '../reminders/entities/reminder.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { HelpdeskCronConfig } from '../tickets/entities/helpdesk-cron-config.entity';
import { Notification } from './entities/notification.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder, Activity, User, Ticket, HelpdeskCronConfig, Notification, Opportunity, Client, Tenant]),
    MailModule,
    ConfigModule,
    forwardRef(() => TicketsModule),
  ],
  providers: [NotificationsSchedulerService, NotificationsService, NotificationsGateway],
  controllers: [NotificationsController],
  exports: [NotificationsSchedulerService, NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
