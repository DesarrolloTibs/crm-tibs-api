import { Controller, Get, Patch, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PipelinesService } from './pipelines.service';

@ApiTags('pipelines')
@ApiBearerAuth()
@Controller('pipelines')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get('main')
  @ApiOperation({ summary: 'Obtener el pipeline principal con sus etapas' })
  getMainPipeline() {
    return this.pipelinesService.getMainPipeline();
  }

  @Get('main/stages/active')
  @ApiOperation({ summary: 'Obtener las etapas activas del pipeline principal' })
  getActiveStages() {
    return this.pipelinesService.getActiveStagesOfMainPipeline();
  }

  @Patch('main')
  @ApiOperation({ summary: 'Actualizar configuración del pipeline principal y sus etapas' })
  updateMainPipeline(@Body() updateDto: any) {
    // We can use a loose validation or map type because of dynamic inline stage list edits
    return this.pipelinesService.updateMainPipeline(updateDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los pipelines con sus etapas' })
  findAll() {
    return this.pipelinesService.findAll();
  }
}
