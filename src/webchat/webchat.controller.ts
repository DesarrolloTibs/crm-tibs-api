import {
  Controller,
  Post,
  Body,
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

@ApiTags('webchat')
@ApiBearerAuth()
@Controller('webchat')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class WebchatController {
  constructor(
    private readonly webchatService: WebchatService,
  ) {}

  @Post('query')
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
}
