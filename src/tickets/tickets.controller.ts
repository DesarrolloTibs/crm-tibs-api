import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UsePipes, ValidationPipe, Query, ParseUUIDPipe, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ArchiveTicketDto } from './dto/archive-ticket.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    return user || null;
  }
}

@ApiTags('tickets')
@Controller('tickets')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Crear un nuevo ticket (Público o Interno)' })
  createPublic(@Body() createTicketDto: CreateTicketDto, @GetUser() user?: User) {
    return this.ticketsService.create(createTicketDto, user);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener la lista de tickets' })
  findAll(
    @Query('stage_id') stage_id?: string,
    @Query('showArchived') showArchived?: string,
  ) {
    const showArchivedBool = showArchived === 'true';
    return this.ticketsService.findAll(stage_id, showArchivedBool);
  }

  @Get('public/query')
  @ApiOperation({ summary: 'Consultar el estatus de un ticket o lista de tickets por correo o número de ticket' })
  queryPublic(
    @Query('email') email?: string,
    @Query('ticketNumber') ticketNumber?: string,
  ) {
    return this.ticketsService.queryPublic(email, ticketNumber);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener detalles de un ticket' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Actualizar datos de un ticket' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateTicketDto: UpdateTicketDto, @GetUser() user: User) {
    return this.ticketsService.update(id, updateTicketDto, user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Eliminar un ticket' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.remove(id);
  }

  @Patch(':id/archive')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Archivar o desarchivar un ticket' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() archiveTicketDto: ArchiveTicketDto,
  ) {
    return this.ticketsService.archive(id, archiveTicketDto);
  }
}
