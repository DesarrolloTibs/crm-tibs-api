import { Controller, Get, Body, Patch, Param, UseGuards, UsePipes, ValidationPipe, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OpportunityLabelsService } from './opportunity-labels.service';
import { UpdateOpportunityLabelDto } from './dto/update-opportunity-label.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/users/entities/user.entity';

@ApiTags('opportunity-labels')
@ApiBearerAuth()
@Controller('opportunity-labels')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OpportunityLabelsController {
  constructor(private readonly labelsService: OpportunityLabelsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las etiquetas de oportunidad' })
  async findAll() {
    return this.labelsService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una etiqueta de oportunidad' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateOpportunityLabelDto,
    @GetUser() user: User,
  ) {
    const userId = user.id || (user as any).userId;
    return this.labelsService.update(id, updateDto.strname, userId);
  }
}
