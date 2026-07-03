import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { AiAgentService } from './ai-agent.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { AiAgentConfig } from './entities/ai-agent-config.entity';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly aiAgentService: AiAgentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las conversaciones de los canales' })
  async getConversations(@GetUser() user: User) {
    const isAdmin = user.role === Role.Admin;
    return this.conversationsService.findAll(user.id, isAdmin);
  }

  @Get('ai-config')
  @ApiOperation({ summary: 'Obtener la configuración global del Agente de IA' })
  async getAiConfig() {
    return this.aiAgentService.getOrInitConfig();
  }

  @Post('ai-config')
  @ApiOperation({ summary: 'Guardar/Actualizar la configuración global del Agente de IA' })
  async updateAiConfig(@Body() body: any) {
    // Permitir cualquier campo parcial de AiAgentConfig
    return this.aiAgentService.saveConfig(body);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Obtener los mensajes de una conversación específica' })
  async getMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.findMessages(id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar un mensaje manual (intervención humana)' })
  async sendManualMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('content') content: string,
  ) {
    return this.conversationsService.sendManualMessage(id, user.id, content);
  }

  @Patch(':id/bot-status')
  @ApiOperation({ summary: 'Activar o desactivar el bot en una conversación' })
  async toggleBotStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('botActive') botActive: boolean,
  ) {
    return this.conversationsService.toggleBotStatus(id, botActive, user.id);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Reasignar la conversación a otro ejecutivo' })
  async assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('assignedUserId') assignedUserId: string,
  ) {
    return this.conversationsService.assignUser(id, assignedUserId, user.id);
  }

  @Post('test-receive')
  @ApiOperation({ summary: 'Simular mensaje entrante para pruebas locales' })
  async testReceive(
    @Body('channel') channel: string,
    @Body('externalId') externalId: string,
    @Body('clientNickname') clientNickname: string,
    @Body('text') text: string,
  ) {
    return this.conversationsService.receiveIncomingMessage(channel, externalId, clientNickname, text);
  }

  @Post('webhook/:channel')
  @ApiOperation({ summary: 'Webhook oficial de Meta Graph API' })
  async webhook(
    @Param('channel') channel: string,
    @Body() body: any,
  ) {
    // En producción, aquí mapearíamos el webhook oficial de Meta
    // extrayendo el sender, el texto y llamando a receiveIncomingMessage.
    console.log(`[META WEBHOOK RECEIVED] Canal: ${channel}`, JSON.stringify(body));
    return { status: 'OK' };
  }
}
