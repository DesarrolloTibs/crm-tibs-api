import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UsePipes, ValidationPipe, UseInterceptors, UploadedFile, Query, UseGuards, ParseBoolPipe, Res, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { join } from 'path';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { GetOpportunitiesFilterDto } from './dto/get-opportunities-filter.dto';
import { User } from 'src/users/entities/user.entity';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('opportunities')
@ApiBearerAuth()
@Controller('opportunities')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) { }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva oportunidad' })
  create(@Body() createOpportunityDto: CreateOpportunityDto) {
    return this.opportunitiesService.create(createOpportunityDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener oportunidades filtradas (etapa, archivado)' })
  findAll(
    @Query() filterDto: GetOpportunitiesFilterDto,
  ) {
    const { stage_id, showArchived } = filterDto;
    return this.opportunitiesService.findAll(stage_id, showArchived);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todas las oportunidades del usuario (sin filtrar)' })
  findAllUnfiltered(@GetUser() user: User) {
    // Asegurarnos de que el objeto user está presente
    if (!user) {
      throw new InternalServerErrorException('No se pudo obtener la información del usuario.');
    }
    return this.opportunitiesService.findAllUnfiltered(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una oportunidad por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una oportunidad' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOpportunityDto: UpdateOpportunityDto,
  ) {

    return this.opportunitiesService.update(id, updateOpportunityDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una oportunidad' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.remove(id);
  }

  @Post(':id/files')
  @ApiOperation({ summary: 'Subir archivo para una oportunidad' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo y metadatos',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        date: { type: 'string', format: 'date' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
    @Body('date') date?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo.');
    }
    const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.opportunitiesService.addOpportunityFile(id, decodedFileName, file, title, date);
  }

  @Get(':id/files/:fileId/download')
  @ApiOperation({ summary: 'Descargar un archivo de la oportunidad' })
  async downloadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.opportunitiesService.getOpportunityFile(id, fileId);
    return this.opportunitiesService.downloadFile(file.filePath, file.fileName, res);
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Eliminar un archivo de la oportunidad' })
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.opportunitiesService.deleteOpportunityFile(id, fileId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archivar o desarchivar una oportunidad' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() archiveOpportunityDto: ArchiveOpportunityDto,
  ) {
    return this.opportunitiesService.archive(id, archiveOpportunityDto);
  }
}
