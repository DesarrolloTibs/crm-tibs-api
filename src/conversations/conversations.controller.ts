import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { AiAgentService } from './ai-agent.service';
import {
  AssignUserDto,
  ToggleBotStatusDto,
  SendManualMessageDto,
  SendTemplateMessageDto,
  UpsertBaseTemplateDto,
  SelectExistingBaseTemplateDto,
} from './dto/conversations.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';


@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly aiAgentService: AiAgentService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener todas las conversaciones de los canales' })
  async getConversations(@GetUser() user: User) {
    const isAdmin = user.role === Role.Admin || user.role === Role.SuperAdmin || (user.role as any) === 'superadmin';
    return this.conversationsService.findAll(user.id, isAdmin);
  }

  @Get('ai-config')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener la configuración global del Agente de IA' })
  async getAiConfig() {
    return this.aiAgentService.getOrInitConfig();
  }

  @Post('ai-config')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Guardar/Actualizar la configuración global del Agente de IA' })
  async updateAiConfig(@Body() body: any) {
    return this.aiAgentService.saveConfig(body);
  }

  @Get('sub-agents')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener todos los sub-agentes configurados' })
  async getSubAgents() {
    return this.aiAgentService.getSubAgents();
  }

  @Post('sub-agents')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crear o actualizar la configuración de un sub-agente' })
  async saveSubAgent(@Body() body: any) {
    return this.aiAgentService.saveSubAgent(body);
  }

  @Delete('sub-agents/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Eliminar un sub-agente' })
  async deleteSubAgent(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiAgentService.deleteSubAgent(id);
  }

  @Get('channels')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener todas las configuraciones de canales' })
  async getChannels() {
    return this.conversationsService.findChannels();
  }

  @Post('channels')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crear o actualizar la configuración de un canal' })
  async saveChannel(@Body() body: any) {
    return this.conversationsService.saveChannel(body);
  }

  @Delete('channels/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Eliminar la configuración de un canal' })
  async deleteChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.deleteChannel(id);
  }

  @Get('channels/:channelConfigId/base-template')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener la plantilla base de WhatsApp vinculada al canal' })
  async getBaseTemplate(@Param('channelConfigId', ParseUUIDPipe) channelConfigId: string) {
    return this.conversationsService.getBaseTemplate(channelConfigId);
  }

  @Put('channels/:channelConfigId/base-template')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Editar componentes (header, body, footer) de la plantilla base en Meta',
    description:
      'Permite modificar únicamente headerText, bodyText y footerText con impacto directo en Meta Graph API. El nombre técnico en Meta es fijo, inmutable y obligatorio: crm_inicio_conversacion',
  })
  async upsertBaseTemplate(
    @Param('channelConfigId', ParseUUIDPipe) channelConfigId: string,
    @Body() body: UpsertBaseTemplateDto,
  ) {
    return this.conversationsService.upsertBaseTemplate(channelConfigId, body);
  }

  @Post('channels/:channelConfigId/select-base-template')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Designar una plantilla aprobada de Meta como la plantilla base del canal' })
  async selectBaseTemplate(
    @Param('channelConfigId', ParseUUIDPipe) channelConfigId: string,
    @Body() body: SelectExistingBaseTemplateDto,
  ) {
    return this.conversationsService.selectExistingAsBaseTemplate(channelConfigId, body);
  }

  @Get('webhook/:channel')
  @ApiOperation({ summary: 'Verificación del webhook de Meta (GET)' })
  async verifyMetaWebhook(
    @Param('channel') channel: string,
    @Query() query: any,
    @Res() res: any,
  ) {
    const mode = query['hub.mode'] || query.hub?.mode;
    const token = query['hub.verify_token'] || query.hub?.verify_token;
    const challenge = query['hub.challenge'] || query.hub?.challenge;

    const verifiedChallenge = await this.conversationsService.verifyMetaWebhook(channel, mode, token, challenge);
    return res.status(200).send(verifiedChallenge);
  }

  @Post('webhook/:channel')
  @ApiOperation({ summary: 'Procesamiento de webhook de Meta (POST)' })
  async handleMetaWebhook(
    @Param('channel') channel: string,
    @Body() body: any,
  ) {
    return this.conversationsService.handleIncomingWebhook(channel, body);
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

  @Get(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener los mensajes de una conversación específica' })
  async getMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.findMessages(id);
  }

  @Post(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Enviar un mensaje manual (intervención humana)' })
  async sendManualMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: SendManualMessageDto,
  ) {
    return this.conversationsService.sendManualMessage(id, user.id, body.content);
  }

  @Get(':id/templates')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener la plantilla base aprobada de WhatsApp para la conversación' })
  async getTemplates(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('all') all?: string,
  ) {
    const fetchAll = all === 'true' || all === '1';
    return this.conversationsService.getWhatsAppTemplates(id, fetchAll);
  }

  @Post(':id/template-message')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Enviar una plantilla aprobada de Meta por WhatsApp' })
  async sendTemplateMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: SendTemplateMessageDto,
  ) {
    return this.conversationsService.sendTemplateMessage(id, user.id, body);
  }

  @Get(':id/base-template')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener la plantilla base para iniciar/reanudar la conversación activa' })
  async getConversationBaseTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.getConversationBaseTemplate(id);
  }

  @Patch(':id/bot-status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Activar o desactivar el bot en una conversación' })
  async toggleBotStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: ToggleBotStatusDto,
  ) {
    return this.conversationsService.toggleBotStatus(id, body.botActive, user.id);
  }

  @Patch(':id/assign')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Reasignar la conversación a otro ejecutivo' })
  async assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: AssignUserDto,
  ) {
    return this.conversationsService.assignUser(id, body.assignedUserId || null, user.id);
  }
}

