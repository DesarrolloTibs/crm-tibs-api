import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { Helpdesk } from './entities/helpdesk.entity';
import { TicketStage } from './entities/ticket-stage.entity';
import { Client, ClientCategory } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsGateway } from './tickets.gateway';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Helpdesk)
    private readonly helpdeskRepository: Repository<Helpdesk>,
    @InjectRepository(TicketStage)
    private readonly stageRepository: Repository<TicketStage>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly ticketsGateway: TicketsGateway,
  ) {}

  async create(createTicketDto: CreateTicketDto): Promise<Ticket> {
    const ticket = new Ticket();
    ticket.strtitle = createTicketDto.strtitle;
    ticket.tipo_incidencia = createTicketDto.tipo_incidencia;
    ticket.description = createTicketDto.description;
    ticket.priority = createTicketDto.priority ?? 1;
    ticket.alert_sent = false;
    ticket.fecha_apertura = new Date();
    ticket.stage_entered_at = new Date();

    // 1. Obtener la Mesa de Ayuda Principal
    const helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });
    if (!helpdesk) {
      throw new InternalServerErrorException('No se ha inicializado una Mesa de Ayuda Principal en el sistema.');
    }
    ticket.helpdesk_id = helpdesk.id;

    // 2. Obtener Etapa Inicial
    let stage: TicketStage | null = null;
    if (createTicketDto.stage_id) {
      stage = await this.stageRepository.findOne({
        where: { id: createTicketDto.stage_id, helpdesk_id: helpdesk.id },
      });
      if (!stage) {
        throw new NotFoundException(`La etapa con ID "${createTicketDto.stage_id}" no pertenece a esta mesa de ayuda.`);
      }
    } else {
      stage = await this.stageRepository.findOne({
        where: { helpdesk_id: helpdesk.id, blninitial: true, blnstatus: true },
      });
      if (!stage) {
        throw new InternalServerErrorException('No se ha configurado una etapa inicial activa para la Mesa de Ayuda.');
      }
    }
    ticket.stage_id = stage.id;

    // 3. Vincular o crear Cliente
    if (createTicketDto.cliente_id) {
      const existingClient = await this.clientRepository.findOne({ where: { id: createTicketDto.cliente_id } });
      if (!existingClient) {
        throw new NotFoundException(`El cliente con ID "${createTicketDto.cliente_id}" no existe.`);
      }
      ticket.cliente_id = existingClient.id;
    } else if (createTicketDto.contactEmail) {
      const email = createTicketDto.contactEmail.trim().toLowerCase();
      // Intentar buscar por correo
      let client = await this.clientRepository.findOne({ where: { correo: email } });
      if (client) {
        ticket.cliente_id = client.id;
      } else {
        // Crear nuevo cliente
        let firstName = createTicketDto.contactName?.trim() || 'Cliente';
        let lastName = 'Externo';
        if (createTicketDto.contactName) {
          const nameParts = createTicketDto.contactName.trim().split(/\s+/);
          if (nameParts.length > 1) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else {
            firstName = nameParts[0];
            lastName = '';
          }
        }

        const newClient = this.clientRepository.create({
          nombre: firstName,
          apellido: lastName,
          correo: email,
          telefono: createTicketDto.contactPhone || '',
          empresa: createTicketDto.companyName || '',
          category: ClientCategory.CONTACTO,
          estatus: true,
        });

        const savedClient = await this.clientRepository.save(newClient);
        ticket.cliente_id = savedClient.id;
      }
      // Guardamos la info de contacto directo también
      ticket.contactName = createTicketDto.contactName || null;
      ticket.contactEmail = email;
      ticket.contactPhone = createTicketDto.contactPhone || null;
    } else {
      // Campos de contacto opcionales
      ticket.contactName = createTicketDto.contactName || null;
      ticket.contactEmail = null;
      ticket.contactPhone = createTicketDto.contactPhone || null;
    }

    if (createTicketDto.responsable_id) {
      ticket.responsable_id = createTicketDto.responsable_id;
    }

    const savedTicket = await this.ticketRepository.save(ticket);
    const fullTicket = await this.findOne(savedTicket.id);
    this.ticketsGateway.emitTicketCreated(fullTicket);
    return fullTicket;
  }

  async findAll(stage_id?: string): Promise<Ticket[]> {
    const qb = this.ticketRepository.createQueryBuilder('ticket');
    qb.leftJoinAndSelect('ticket.cliente', 'cliente')
      .leftJoinAndSelect('ticket.responsable', 'responsable')
      .leftJoinAndSelect('ticket.stage', 'stage')
      .leftJoinAndSelect('ticket.helpdesk', 'helpdesk');

    if (stage_id) {
      qb.where('ticket.stage_id = :stage_id', { stage_id });
    }

    qb.orderBy('ticket.fecha_apertura', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      relations: ['cliente', 'responsable', 'stage', 'helpdesk'],
    });
    if (!ticket) {
      throw new NotFoundException(`El ticket con ID "${id}" no existe.`);
    }
    return ticket;
  }

  async update(id: string, updateTicketDto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (updateTicketDto.strtitle !== undefined) ticket.strtitle = updateTicketDto.strtitle;
    if (updateTicketDto.tipo_incidencia !== undefined) ticket.tipo_incidencia = updateTicketDto.tipo_incidencia;
    if (updateTicketDto.description !== undefined) ticket.description = updateTicketDto.description;
    if (updateTicketDto.priority !== undefined) ticket.priority = updateTicketDto.priority;
    if (updateTicketDto.notas_resolucion !== undefined) ticket.notas_resolucion = updateTicketDto.notas_resolucion || null;

    if (updateTicketDto.contactName !== undefined) ticket.contactName = updateTicketDto.contactName || null;
    if (updateTicketDto.contactEmail !== undefined) ticket.contactEmail = updateTicketDto.contactEmail || null;
    if (updateTicketDto.contactPhone !== undefined) ticket.contactPhone = updateTicketDto.contactPhone || null;

    if (updateTicketDto.responsable_id !== undefined) {
      ticket.responsable_id = updateTicketDto.responsable_id || null;
      if (ticket.responsable_id) {
        const userRepo = this.ticketRepository.manager.getRepository(User);
        ticket.responsable = await userRepo.findOne({ where: { id: ticket.responsable_id } });
      } else {
        ticket.responsable = null;
      }
    }

    if (updateTicketDto.cliente_id !== undefined) {
      ticket.cliente_id = updateTicketDto.cliente_id || null;
      if (ticket.cliente_id) {
        ticket.cliente = await this.clientRepository.findOne({ where: { id: ticket.cliente_id } });
      } else {
        ticket.cliente = null;
      }
    }

    // Lógica especial de cambio de etapa
    if (updateTicketDto.stage_id && updateTicketDto.stage_id !== ticket.stage_id) {
      const newStage = await this.stageRepository.findOne({ where: { id: updateTicketDto.stage_id } });
      if (!newStage) {
        throw new NotFoundException(`La etapa con ID "${updateTicketDto.stage_id}" no existe.`);
      }
      
      // Si la nueva etapa es "Resuelto"
      if (newStage.strname === 'Resuelto') {
        const notes = updateTicketDto.notas_resolucion ?? ticket.notas_resolucion;
        if (!notes || !notes.trim()) {
          throw new BadRequestException('Las notas de resolución son obligatorias al resolver el ticket.');
        }
        ticket.fecha_cierre = new Date();
      } else {
        ticket.fecha_cierre = null;
      }

      ticket.stage_id = newStage.id;
      ticket.stage = newStage;
      ticket.stage_entered_at = new Date();
    } else if (ticket.stage && ticket.stage.strname === 'Resuelto') {
      // Si ya estaba resuelto pero no cambió de etapa, igual verificamos que no limpien las notas
      const notes = updateTicketDto.notas_resolucion !== undefined ? updateTicketDto.notas_resolucion : ticket.notas_resolucion;
      if (!notes || !notes.trim()) {
        throw new BadRequestException('Las notas de resolución son obligatorias al resolver el ticket.');
      }
    }

    const saved = await this.ticketRepository.save(ticket);
    const fullTicket = await this.findOne(saved.id);
    this.ticketsGateway.emitTicketUpdated(fullTicket);
    return fullTicket;
  }

  async remove(id: string): Promise<void> {
    const result = await this.ticketRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`El ticket con ID "${id}" no existe.`);
    }
    this.ticketsGateway.emitTicketDeleted(id);
  }
}
