import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { AiAgentService } from './ai-agent.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
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
    @Body('content') content: string,
  ) {
    return this.conversationsService.sendManualMessage(id, user.id, content);
  }

  @Patch(':id/bot-status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Activar o desactivar el bot en una conversación' })
  async toggleBotStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('botActive') botActive: boolean,
  ) {
    return this.conversationsService.toggleBotStatus(id, botActive, user.id);
  }

  @Patch(':id/assign')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Reasignar la conversación a otro ejecutivo' })
  async assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('assignedUserId') assignedUserId: string,
  ) {
    return this.conversationsService.assignUser(id, assignedUserId, user.id);
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
}
