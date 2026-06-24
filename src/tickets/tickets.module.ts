import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { Helpdesk } from './entities/helpdesk.entity';
import { TicketStage } from './entities/ticket-stage.entity';
import { Client } from '../clients/entities/client.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { HelpdesksService } from './helpdesks.service';
import { HelpdesksController } from './helpdesks.controller';
import { TicketsGateway } from './tickets.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Helpdesk, TicketStage, Client]),
  ],
  controllers: [TicketsController, HelpdesksController],
  providers: [TicketsService, HelpdesksService, TicketsGateway],
  exports: [TicketsService, HelpdesksService, TypeOrmModule, TicketsGateway],
})
export class TicketsModule {}
