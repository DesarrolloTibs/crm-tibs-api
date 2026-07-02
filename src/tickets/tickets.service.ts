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
import { ArchiveTicketDto } from './dto/archive-ticket.dto';
import { TicketsGateway } from './tickets.gateway';
import { TicketInteractionsService } from '../ticket-interactions/ticket-interactions.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly ticketInteractionsService: TicketInteractionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createTicketDto: CreateTicketDto, user?: User): Promise<Ticket> {
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

    // Registrar en el historial
    const username = user?.username || 'Cliente';
    const logComment = user 
      ? `El usuario ${username} creó el ticket #${fullTicket.ticket_number}.`
      : `El cliente ${fullTicket.contactName || 'Externo'} creó el ticket #${fullTicket.ticket_number} desde el portal público.`;

    await this.ticketInteractionsService.create({
      ticket_id: fullTicket.id,
      comment: logComment,
    });

    this.ticketsGateway.emitTicketCreated(fullTicket);

    if (fullTicket.responsable_id) {
      const ticketNumStr = fullTicket.ticket_number.toString().padStart(5, '0');
      const creatorName = user?.username || 'Sistema';
      const assignMessage = `Se te ha asignado el ticket <strong>#${ticketNumStr}</strong>: ${fullTicket.strtitle}.<br/><br/>El usuario <strong>${creatorName}</strong> creó el ticket y te asignó como agente responsable.<br/><br/>Por favor, ingresa a la plataforma para revisar el caso y dar seguimiento a la brevedad.`;

      await this.notificationsService.createAndSendNotification(
        fullTicket.responsable_id,
        'Asignación de Ticket',
        assignMessage,
        'ticket_assigned',
        fullTicket.id,
      );
    }

    return fullTicket;
  }

  async findAll(stage_id?: string, showArchived = false): Promise<Ticket[]> {
    const qb = this.ticketRepository.createQueryBuilder('ticket');
    qb.leftJoinAndSelect('ticket.cliente', 'cliente')
      .leftJoinAndSelect('ticket.responsable', 'responsable')
      .leftJoinAndSelect('ticket.stage', 'stage')
      .leftJoinAndSelect('ticket.helpdesk', 'helpdesk');

    qb.where('ticket.archived = :showArchived', { showArchived });

    if (stage_id) {
      qb.andWhere('ticket.stage_id = :stage_id', { stage_id });
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

  async update(id: string, updateTicketDto: UpdateTicketDto, user?: User): Promise<Ticket> {
    const ticket = await this.findOne(id);
    const changes: string[] = [];
    const originalStageId = ticket.stage_id;
    const originalResponsableId = ticket.responsable_id;
    const originalStageName = ticket.stage ? ticket.stage.strname : 'N/A';
    const originalResponsable = ticket.responsable;

    // Title
    if (updateTicketDto.strtitle !== undefined && updateTicketDto.strtitle !== ticket.strtitle) {
      changes.push(`- Asunto: "${ticket.strtitle}" -> "${updateTicketDto.strtitle}"`);
      ticket.strtitle = updateTicketDto.strtitle;
    }
    // Tipo de incidencia
    if (updateTicketDto.tipo_incidencia !== undefined && updateTicketDto.tipo_incidencia !== ticket.tipo_incidencia) {
      changes.push(`- Tipo de incidencia: "${ticket.tipo_incidencia}" -> "${updateTicketDto.tipo_incidencia}"`);
      ticket.tipo_incidencia = updateTicketDto.tipo_incidencia;
    }
    // Description
    if (updateTicketDto.description !== undefined && updateTicketDto.description !== ticket.description) {
      changes.push(`- Descripción: "${ticket.description || 'Sin descripción'}" -> "${updateTicketDto.description || 'Sin descripción'}"`);
      ticket.description = updateTicketDto.description;
    }
    // Priority
    if (updateTicketDto.priority !== undefined && updateTicketDto.priority !== ticket.priority) {
      const getPriorityStr = (p: number) => p === 0 ? 'Sin prioridad' : p === 1 ? 'Baja' : p === 2 ? 'Media' : 'Alta';
      changes.push(`- Prioridad: "${getPriorityStr(ticket.priority)}" -> "${getPriorityStr(updateTicketDto.priority)}"`);
      ticket.priority = updateTicketDto.priority;
    }
    // Notas de resolución
    if (updateTicketDto.notas_resolucion !== undefined && (updateTicketDto.notas_resolucion || null) !== ticket.notas_resolucion) {
      changes.push(`- Notas de resolución: "${ticket.notas_resolucion || 'Sin notas'}" -> "${updateTicketDto.notas_resolucion || 'Sin notas'}"`);
      ticket.notas_resolucion = updateTicketDto.notas_resolucion || null;
    }
    // Contact Info
    if (updateTicketDto.contactName !== undefined && updateTicketDto.contactName !== ticket.contactName) {
      changes.push(`- Nombre de contacto: "${ticket.contactName || 'N/A'}" -> "${updateTicketDto.contactName || 'N/A'}"`);
      ticket.contactName = updateTicketDto.contactName || null;
    }
    if (updateTicketDto.contactEmail !== undefined && updateTicketDto.contactEmail !== ticket.contactEmail) {
      changes.push(`- Correo de contacto: "${ticket.contactEmail || 'N/A'}" -> "${updateTicketDto.contactEmail || 'N/A'}"`);
      ticket.contactEmail = updateTicketDto.contactEmail || null;
    }
    if (updateTicketDto.contactPhone !== undefined && updateTicketDto.contactPhone !== ticket.contactPhone) {
      changes.push(`- Teléfono de contacto: "${ticket.contactPhone || 'N/A'}" -> "${updateTicketDto.contactPhone || 'N/A'}"`);
      ticket.contactPhone = updateTicketDto.contactPhone || null;
    }

    // Agente Responsable
    if (updateTicketDto.responsable_id !== undefined && updateTicketDto.responsable_id !== ticket.responsable_id) {
      const oldAgentName = ticket.responsable ? ticket.responsable.username : 'Sin asignar';
      let newAgentName = 'Sin asignar';
      if (updateTicketDto.responsable_id) {
        const userRepo = this.ticketRepository.manager.getRepository(User);
        const newAgent = await userRepo.findOne({ where: { id: updateTicketDto.responsable_id } });
        newAgentName = newAgent ? newAgent.username : 'Sin asignar';
        ticket.responsable = newAgent;
      } else {
        ticket.responsable = null;
      }
      changes.push(`- Agente responsable: "${oldAgentName}" -> "${newAgentName}"`);
      ticket.responsable_id = updateTicketDto.responsable_id || null;
    }

    // Cliente
    if (updateTicketDto.cliente_id !== undefined && updateTicketDto.cliente_id !== ticket.cliente_id) {
      const oldClientName = ticket.cliente ? `${ticket.cliente.nombre} ${ticket.cliente.apellido}` : 'Sin asignar';
      let newClientName = 'Sin asignar';
      if (updateTicketDto.cliente_id) {
        ticket.cliente = await this.clientRepository.findOne({ where: { id: updateTicketDto.cliente_id } });
        newClientName = ticket.cliente ? `${ticket.cliente.nombre} ${ticket.cliente.apellido}` : 'Sin asignar';
      } else {
        ticket.cliente = null;
      }
      changes.push(`- Cliente: "${oldClientName}" -> "${newClientName}"`);
      ticket.cliente_id = updateTicketDto.cliente_id || null;
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

      changes.push(`- Etapa: "${ticket.stage ? ticket.stage.strname : 'N/A'}" -> "${newStage.strname}"`);
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

    // Registrar cambios en el historial (interacciones de ticket)
    if (changes.length > 0) {
      const username = user?.username || 'Sistema';
      const logComment = `El usuario ${username} modificó el ticket:\n${changes.join('\n')}`;
      await this.ticketInteractionsService.create({
        ticket_id: id,
        comment: logComment,
      });

      // Solo notifica al responsable asignado. Si no tiene, no notifica a nadie.
      if (fullTicket.responsable_id) {
        const ticketNumStr = fullTicket.ticket_number.toString().padStart(5, '0');
        const username = user?.username || 'Sistema';
        const notificationChanges = changes.map(c => c.replace(/\s*->\s*/, ' a ').replace(/^- /, '• '));
        const changesText = notificationChanges.join('\n');
        const detailMessage = `El usuario ${username} modificó el ticket #${ticketNumStr}:\n${changesText}`;

        if (updateTicketDto.responsable_id !== undefined && updateTicketDto.responsable_id !== originalResponsableId) {
          // Asignado a un nuevo responsable
          const oldAgentName = originalResponsable ? originalResponsable.username : 'Sin asignar';
          const newAgentName = fullTicket.responsable ? fullTicket.responsable.username : 'Sin asignar';

          const assignMessage = `Se te ha asignado el ticket <strong>#${ticketNumStr}</strong>: ${fullTicket.strtitle}.<br/><br/>El usuario <strong>${username}</strong> actualizó el ticket, asignándote como agente responsable.<br/><br/><strong>Cambio realizado:</strong><br/><br/>Agente responsable: de <strong>${oldAgentName} -> Asignado a ${newAgentName}</strong>.<br/><br/>Por favor, ingresa a la plataforma para revisar el caso y dar seguimiento a la brevedad.`;

          await this.notificationsService.createAndSendNotification(
            fullTicket.responsable_id,
            'Asignación de Ticket',
            assignMessage,
            'ticket_assigned',
            fullTicket.id,
          );
        } else if (updateTicketDto.stage_id && updateTicketDto.stage_id !== originalStageId) {
          // Cambiado de etapa
          const newStageName = fullTicket.stage ? fullTicket.stage.strname : 'N/A';
          const moveMessage = `El usuario <strong>${username}</strong> realizó una actualización en el ticket <strong>#${ticketNumStr}</strong>.<br/><br/><strong>Cambio realizado:</strong><br/><br/>Etapa: de <strong>${originalStageName} -> ${newStageName}</strong>.`;

          await this.notificationsService.createAndSendNotification(
            fullTicket.responsable_id,
            'Movimiento de Ticket',
            moveMessage,
            'ticket_moved',
            fullTicket.id,
          );
        } else {
          // Datos actualizados
          const formattedChanges = changes.map(c => {
            let cleaned = c.replace(/^- /, '');
            const parts = cleaned.split(/\s*->\s*/);
            if (parts.length === 2) {
              const colonIndex = parts[0].indexOf(':');
              if (colonIndex !== -1) {
                const label = parts[0].substring(0, colonIndex).trim();
                const originalVal = parts[0].substring(colonIndex + 1).replace(/"/g, '').trim();
                const newVal = parts[1].replace(/"/g, '').trim();
                return `${label}: de <strong>${originalVal} -> ${newVal}</strong>.`;
              }
            }
            return cleaned;
          }).join('<br/>');

          const updateMessage = `El usuario <strong>${username}</strong> realizó una actualización en el ticket <strong>#${ticketNumStr}</strong>.<br/><br/><strong>Cambio realizado:</strong><br/><br/>${formattedChanges}<br/><br/>Ingresa a la plataforma para revisar los cambios y dar el seguimiento correspondiente, si es necesario.`;

          await this.notificationsService.createAndSendNotification(
            fullTicket.responsable_id,
            'Ticket Actualizado',
            updateMessage,
            'ticket_updated',
            fullTicket.id,
          );
        }
      }
    }

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

  async archive(id: string, archiveTicketDto: ArchiveTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id);
    ticket.archived = archiveTicketDto.archived;
    const saved = await this.ticketRepository.save(ticket);
    const fullTicket = await this.findOne(saved.id);
    this.ticketsGateway.emitTicketUpdated(fullTicket);
    return fullTicket;
  }

  async queryPublic(email?: string, ticketNumber?: string): Promise<Ticket[]> {
    if (!email && !ticketNumber) {
      throw new BadRequestException('Debe proporcionar al menos un correo electrónico o un número de ticket.');
    }

    const qb = this.ticketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.cliente', 'cliente')
      .leftJoinAndSelect('ticket.stage', 'stage')
      .leftJoinAndSelect('ticket.responsable', 'responsable');

    if (ticketNumber) {
      const cleanNumber = parseInt(ticketNumber.replace('#', '').trim(), 10);
      if (isNaN(cleanNumber)) {
        throw new BadRequestException('El número de ticket no es válido.');
      }
      qb.andWhere('ticket.ticket_number = :cleanNumber', { cleanNumber });
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      qb.andWhere(
        '(LOWER(ticket.contactEmail) = :cleanEmail OR LOWER(cliente.correo) = :cleanEmail)',
        { cleanEmail }
      );
    }

    qb.orderBy('ticket.fecha_apertura', 'DESC');
    return qb.getMany();
  }
}
