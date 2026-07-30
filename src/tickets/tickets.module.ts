import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { Helpdesk } from './entities/helpdesk.entity';
import { TicketStage } from './entities/ticket-stage.entity';
import { HelpdeskCronConfig } from './entities/helpdesk-cron-config.entity';
import { Client } from '../clients/entities/client.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { HelpdesksService } from './helpdesks.service';
import { HelpdesksController } from './helpdesks.controller';
import { TicketsGateway } from './tickets.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketInteractionsModule } from '../ticket-interactions/ticket-interactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Helpdesk, TicketStage, HelpdeskCronConfig, Client]),
    // NotificationsModule: necesario para NotificationsService en TicketsService
    // Ya no circular — HelpdesksService usa EventEmitter para comunicarse con
    // NotificationsSchedulerService en lugar de inyección directa
    NotificationsModule,
    TicketInteractionsModule,
  ],
  controllers: [TicketsController, HelpdesksController],
  providers: [TicketsService, HelpdesksService, TicketsGateway],
  exports: [TicketsService, HelpdesksService, TypeOrmModule, TicketsGateway],
})
export class TicketsModule {}
