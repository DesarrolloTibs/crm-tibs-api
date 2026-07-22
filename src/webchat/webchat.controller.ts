import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WebchatService } from './webchat.service';
import { WebchatQueryDto } from './dto/webchat-query.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { ConversationsService } from '../conversations/conversations.service';

@ApiTags('webchat')
@Controller('webchat')
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

  @Post('public/message')
  @ApiOperation({ summary: 'Enviar mensaje público desde el widget de WebChat en Login' })
  async sendPublicMessage(
    @Body() body: { visitorId: string; text: string; nickname?: string },
  ) {
    const message = await this.conversationsService.receiveIncomingMessage(
      'webchat',
      body.visitorId,
      body.nickname || 'Visitante Webchat',
      body.text,
    );
    return message;
  }

  @Get('public/messages/:visitorId')
  @ApiOperation({ summary: 'Obtener historial de mensajes del visitante de WebChat' })
  async getPublicMessages(@Param('visitorId') visitorId: string) {
    const conversation = await this.conversationsService.findByChannelAndExternalId('webchat', visitorId);
    if (!conversation) {
      return { messages: [], clientName: null, conversationId: null };
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
    };
  }
}
