import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WebchatService } from './webchat.service';
import { WebchatQueryDto } from './dto/webchat-query.dto';
import { SendPublicWebchatMessageDto, GetPublicWebchatQueryDto } from './dto/public-webchat.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { ConversationsService } from '../conversations/conversations.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@ApiTags('webchat')
@Controller('webchat')
// Los endpoints públicos de webchat tienen límite más alto (webhook de IA)
@Throttle({ webhook: { ttl: 60000, limit: 200 } })
// whitelist:false porque el body puede contener campos dinámicos de conversaciones externas
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
export class WebchatController {
  constructor(
    private readonly webchatService: WebchatService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post('query')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Procesar una consulta de lenguaje natural del usuario interno del CRM' })
  async query(
    @GetUser() user: User,
    @Body() body: WebchatQueryDto,
  ) {
    return this.webchatService.processQuery(
      body.question,
      user.id,
      user.role,
      user.username,
      body.conversationHistory,
    );
  }

  @Get('public/init')
  @ApiOperation({ summary: 'Verificar estado y conexión del canal WebChat externo' })
  async getPublicInit(
    @Query('tenantKey') tenantKey?: string,
    @Headers('x-tenant-key') headerTenantKey?: string,
  ) {
    const key = tenantKey || headerTenantKey;
    if (!key) {
      throw new BadRequestException('El parámetro tenantKey es requerido para inicializar la conexión.');
    }

    const tenantInfo = await this.conversationsService.findTenantSchemaByWidgetKey(key);
    if (!tenantInfo) {
      throw new NotFoundException('Canal de WebChat inválido o inactivo.');
    }

    return {
      status: 'active',
      channelConfigId: tenantInfo.channelConfigId,
      tenantSchema: tenantInfo.tenantSchema,
    };
  }

  @Post('public/message')
  @ApiOperation({ summary: 'Enviar mensaje público desde el widget de WebChat externo' })
  async sendPublicMessage(
    @Body() body: SendPublicWebchatMessageDto,
    @Headers('x-tenant-key') headerTenantKey?: string,
  ) {
    const key = body.tenantKey || headerTenantKey;
    if (!key) {
      throw new BadRequestException('El campo tenantKey es requerido.');
    }

    const tenantInfo = await this.conversationsService.findTenantSchemaByWidgetKey(key);
    if (!tenantInfo) {
      throw new NotFoundException('Canal de WebChat inválido o inactivo.');
    }

    return TenantContextService.run({ tenantSchema: tenantInfo.tenantSchema }, async () => {
      const message = await this.conversationsService.receiveIncomingMessage(
        'webchat',
        body.visitorId,
        body.nickname || 'Visitante Webchat',
        body.text,
        tenantInfo.channelConfigId,
        undefined,
        { email: body.email, phone: body.phone },
      );
      return message;
    });
  }

  @Get('public/messages/:visitorId')
  @ApiOperation({ summary: 'Obtener historial de mensajes del visitante de WebChat externo' })
  async getPublicMessages(
    @Param('visitorId') visitorId: string,
    @Query('tenantKey') tenantKey?: string,
    @Headers('x-tenant-key') headerTenantKey?: string,
  ) {
    const key = tenantKey || headerTenantKey;
    if (!key) {
      throw new BadRequestException('El parámetro tenantKey es requerido para identificar la organización.');
    }

    const tenantInfo = await this.conversationsService.findTenantSchemaByWidgetKey(key);
    if (!tenantInfo) {
      throw new NotFoundException('Canal de WebChat inválido o inactivo.');
    }

    return TenantContextService.run({ tenantSchema: tenantInfo.tenantSchema }, async () => {
      const conversation = await this.conversationsService.findByChannelAndExternalId('webchat', visitorId);
      if (!conversation) {
        return { messages: [], clientName: null, clientPhone: null, conversationId: null, botActive: true };
      }
      const messages = await this.conversationsService.findMessages(conversation.id);

      const isGenericName = (name?: string | null) => {
        if (!name) return true;
        const lower = name.trim().toLowerCase();
        return (
          lower === '' ||
          lower === 'visitante webchat' ||
          lower === 'visitante web' ||
          lower === 'visitante' ||
          lower === 'contacto' ||
          lower.startsWith('webchat_')
        );
      };

      let clientName: string | null = null;
      let clientPhone: string | null = conversation.client?.telefono || null;

      if (conversation.clientName && !isGenericName(conversation.clientName)) {
        clientName = conversation.clientName;
      } else if (conversation.client && conversation.client.nombre) {
        const full = `${conversation.client.nombre} ${conversation.client.apellido || ''}`.trim();
        if (!isGenericName(full)) {
          clientName = full;
        }
      }

      return {
        messages,
        clientName,
        clientPhone,
        conversationId: conversation.id,
        botActive: conversation.botActive,
      };
    });
  }
}
