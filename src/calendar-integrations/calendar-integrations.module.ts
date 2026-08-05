import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserCalendarIntegration } from './entities/user-calendar-integration.entity';
import { CalendarWebhookMapping } from './entities/calendar-webhook-mapping.entity';
import { CalendarIntegrationsController } from './calendar-integrations.controller';
import { CalendarWebhooksController } from './calendar-webhooks.controller';
import { GoogleCalendarService } from './services/google-calendar.service';
import { OutlookCalendarService } from './services/outlook-calendar.service';
import { ICloudCalendarService } from './services/icloud-calendar.service';
import { CalendarSyncCoordinatorService } from './services/calendar-sync-coordinator.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserCalendarIntegration, CalendarWebhookMapping]),
  ],
  controllers: [CalendarIntegrationsController, CalendarWebhooksController],
  providers: [
    GoogleCalendarService,
    OutlookCalendarService,
    ICloudCalendarService,
    CalendarSyncCoordinatorService,
  ],
  exports: [CalendarSyncCoordinatorService],
})
export class CalendarIntegrationsModule {}
