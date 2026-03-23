import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UsePipes, ValidationPipe, UseInterceptors, UploadedFile, Query, UseGuards, ParseBoolPipe, Res, InternalServerErrorException } from '@nestjs/common';
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
import { OpportunityStage } from './entities/opportunity.entity';
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
    const { etapa, showArchived } = filterDto;
    return this.opportunitiesService.findAll(etapa, showArchived);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todas las oportunidades del usuario (sin filtrar)' })
  findAllUnfiltered(@GetUser() user: User) {
    // Asegurarnos de que el objeto user está presente
    if (!user) {
      throw new InternalServerErrorException('No se pudo obtener la información del usuario.');
    }
    console.log('Current User:', user); // Debug log
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

    console.log('Update DTO:', updateOpportunityDto); // Debug log  
    return this.opportunitiesService.update(id, updateOpportunityDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una oportunidad' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.remove(id);
  }

  @Post(':id/proposal')
  @ApiOperation({ summary: 'Subir documento de propuesta (PDF/Doc) para una oportunidad' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de la propuesta',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // The file object is available thanks to Multer
    // We can now pass its path or other details to the service
    const normalizedPath = file.path.replace(/\\/g, '/');
    return this.opportunitiesService.addProposalDocument(id, normalizedPath);
  }

  @Get(':id/proposal/download')
  @ApiOperation({ summary: 'Descargar el documento de propuesta' })
  async downloadProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.opportunitiesService.getProposalDocumentPath(id);
    const normalizedPath = filePath.replace(/\\/g, '/');
    const absolutePath = join(process.cwd(), normalizedPath);
    return res.sendFile(absolutePath);
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
