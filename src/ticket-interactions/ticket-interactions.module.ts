import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketInteraction } from './entities/ticket-interaction.entity';
import { TicketInteractionsService } from './ticket-interactions.service';
import { TicketInteractionsController } from './ticket-interactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TicketInteraction])],
  controllers: [TicketInteractionsController],
  providers: [TicketInteractionsService],
  exports: [TicketInteractionsService],
})
export class TicketInteractionsModule {}
