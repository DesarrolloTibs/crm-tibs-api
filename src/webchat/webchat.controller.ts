import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  NotImplementedException,
  Optional,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { WebchatService } from './webchat.service';
import { WebchatQueryDto } from './dto/webchat-query.dto';
import { SendPublicWebchatMessageDto, GetPublicWebchatQueryDto } from './dto/public-webchat.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { ConversationsService } from '../conversations/conversations.service';
import { SpeechToTextService } from '../conversations/speech-to-text.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AudioAuditService } from '../subscriptions/audio-audit.service';

@ApiTags('webchat')
@Controller('webchat')
// Los endpoints públicos de webchat tienen límite más alto (webhook de IA)
@Throttle({ webhook: { ttl: 60000, limit: 200 } })
export class WebchatController {
  constructor(
    private readonly webchatService: WebchatService,
    private readonly conversationsService: ConversationsService,
    private readonly speechToTextService: SpeechToTextService,
    @Optional()
    private readonly audioAuditService?: AudioAuditService,
  ) {}

  @Get('audio-status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Consultar disponibilidad de soporte de audio para el WebChat interno del tenant activo' })
  async getAudioStatus(@GetUser() user: User) {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const policy = await this.speechToTextService.getAudioPolicy(tenantSchema);
    const isSuperAdminPublic =
      tenantSchema === 'public' && (user?.role || '').toString().toLowerCase().trim() === Role.SuperAdmin;

    const ibmAddonEffective = isSuperAdminPublic ? true : policy.ibmAudioEnabled;
    const audioEnabled = !policy.isIbmProvider || ibmAddonEffective;

    return {
      globalProvider: policy.globalProvider,
      rawModelProvider: policy.rawModelProvider,
      usesIbmStt: policy.isIbmProvider,
      ibmAudioEnabled: ibmAddonEffective,
      audioEnabled,
      transcribeEndpointEnabled: policy.isIbmProvider && ibmAddonEffective,
    };
  }

  @Post('transcribe')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Transcribir un archivo de audio a texto plano para el WebChat interno usando IBM Speech to Text' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de audio grabado desde el WebChat interno (campo "audio" o "file")',
    schema: {
      type: 'object',
      properties: {
        audio: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 25 * 1024 * 1024 } }))
  async transcribeAudio(
    @GetUser() user: User,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const policy = await this.speechToTextService.getAudioPolicy(tenantSchema);
    const isSuperAdminPublic =
      tenantSchema === 'public' && (user?.role || '').toString().toLowerCase().trim() === Role.SuperAdmin;

    if (!policy.isIbmProvider) {
      throw new NotImplementedException(
        'El proveedor global actual procesará audio de forma nativa directamente en el agente (pendiente de habilitación). No se utiliza IBM Speech-to-Text.',
      );
    }

    if (!isSuperAdminPublic && !policy.ibmAudioEnabled) {
      throw new ForbiddenException(
        'El soporte de audio (IBM Speech-to-Text) no está habilitado para esta organización. Por favor escribe tu consulta en texto.',
      );
    }

    const file = files?.[0];
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Se requiere un archivo de audio válido para transcribir.');
    }

    let result: { transcript: string | null; durationSeconds: number; mimeType: string };
    try {
      result = await this.speechToTextService.transcribeWithMetrics(
        file.buffer,
        file.mimetype,
      );
    } catch (err: any) {
      if (this.audioAuditService) {
        await this.audioAuditService.recordAudioTranscription({
          tenantId: policy.tenantId,
          tenantSchema,
          channel: 'webchat_interno',
          provider: 'ibm_stt',
          durationSeconds: typeof err?.durationSeconds === 'number' ? err.durationSeconds : 0,
          audioBytes: file.buffer.length,
          mimeType: file.mimetype,
          hasSpeech: false,
          success: false,
          errorMessage: err?.message || 'Error en IBM Speech-to-Text',
          userId: user?.id || null,
        });
      }
      throw err;
    }

    if (this.audioAuditService) {
      await this.audioAuditService.recordAudioTranscription({
        tenantId: policy.tenantId,
        tenantSchema,
        channel: 'webchat_interno',
        provider: 'ibm_stt',
        durationSeconds: result.durationSeconds,
        audioBytes: file.buffer.length,
        mimeType: file.mimetype,
        hasSpeech: Boolean(result.transcript),
        success: true,
        userId: user?.id || null,
      });
    }

    if (!result.transcript) {
      throw new BadRequestException('No se detectó voz en el audio. Por favor intenta hablar más claro o verifica tu micrófono.');
    }

    return {
      text: result.transcript,
      transcript: result.transcript,
      durationSeconds: result.durationSeconds,
    };
  }

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
      user,
    );
  }

  @Get('public/init')
  @ApiOperation({ summary: 'Verificar estado y conexión del canal WebChat externo' })
  async getPublicInit(
    @Query() query: GetPublicWebchatQueryDto,
    @Headers('x-tenant-key') headerTenantKey?: string,
  ) {
    const key = query?.tenantKey || headerTenantKey;
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
    @Query() query: GetPublicWebchatQueryDto,
    @Headers('x-tenant-key') headerTenantKey?: string,
  ) {
    if (!visitorId || !visitorId.trim() || visitorId.trim().length > 150) {
      throw new BadRequestException('El parámetro visitorId es inválido.');
    }
    const key = query?.tenantKey || headerTenantKey;
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
