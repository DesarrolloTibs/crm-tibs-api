import { Controller, Get, Post, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TicketInteractionsService } from './ticket-interactions.service';
import { CreateTicketInteractionDto } from './dto/create-ticket-interaction.dto';

@ApiTags('ticket-interactions')
@ApiBearerAuth()
@Controller('ticket-interactions')
@UseGuards(AuthGuard('jwt'))
export class TicketInteractionsController {
  constructor(private readonly ticketInteractionsService: TicketInteractionsService) {}

  @Post()
  @ApiOperation({ summary: 'Añadir un comentario/registro manual al historial de un ticket' })
  create(@Body() dto: CreateTicketInteractionDto) {
    return this.ticketInteractionsService.create(dto);
  }

  @Get('ticket/:ticketId')
  @ApiOperation({ summary: 'Obtener el historial de interacciones/cambios de un ticket' })
  findAllByTicket(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.ticketInteractionsService.findAllByTicket(ticketId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una interacción del historial de un ticket' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketInteractionsService.remove(id);
  }
}
