import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, ParseUUIDPipe, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ArchiveTicketDto } from './dto/archive-ticket.dto';
import { GetTicketsFilterDto, PublicTicketQueryDto } from './dto/tickets-query.dto';
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
  findAll(@Query() filterDto: GetTicketsFilterDto) {
    return this.ticketsService.findAll(filterDto.stage_id, filterDto.showArchived ?? false);
  }

  @Get('public/query')
  @ApiOperation({ summary: 'Consultar el estatus de un ticket o lista de tickets por correo o número de ticket' })
  queryPublic(@Query() queryDto: PublicTicketQueryDto) {
    return this.ticketsService.queryPublic(queryDto.email, queryDto.ticketNumber);
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
