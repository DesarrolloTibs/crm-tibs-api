import { Controller, Get, Body, Patch, Param, UseGuards, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OpportunityLabelsService } from './opportunity-labels.service';
import { UpdateOpportunityLabelDto } from './dto/update-opportunity-label.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('opportunity-labels')
@ApiBearerAuth()
@Controller('opportunity-labels')
@UseGuards(AuthGuard('jwt'))
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
    if (user.role !== Role.Admin && user.role !== Role.SuperAdmin && (user.role as any) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden editar las etiquetas.');
    }
    const userId = user.id || (user as any).userId;
    return this.labelsService.update(id, updateDto.strname, userId);
  }
}
