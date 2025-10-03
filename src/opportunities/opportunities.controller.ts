import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UsePipes, ValidationPipe, UseInterceptors, UploadedFile, Query, UseGuards, ParseBoolPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';

import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { OpportunityStage } from './entities/opportunity.entity';

@Controller('opportunities')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Body() createOpportunityDto: CreateOpportunityDto) {
    return this.opportunitiesService.create(createOpportunityDto);
  }

  @Get()
  findAll(
    @Query('etapa') etapa?: OpportunityStage,
    @Query('showArchived', new ParseBoolPipe({ optional: true })) showArchived?: boolean,
  ) {
    return this.opportunitiesService.findAll(etapa, showArchived);
  }

  @Get('all')
  findAllUnfiltered() {
    return this.opportunitiesService.findAllUnfiltered();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOpportunityDto: UpdateOpportunityDto,
  ) {

    console.log('Update DTO:', updateOpportunityDto); // Debug log  
    return this.opportunitiesService.update(id, updateOpportunityDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.remove(id);
  }

  @Post(':id/proposal')
  @UseInterceptors(FileInterceptor('file'))
  uploadProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // The file object is available thanks to Multer
    // We can now pass its path or other details to the service
    return this.opportunitiesService.addProposalDocument(id, file.path);
  }

  @Patch(':id/archive')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() archiveOpportunityDto: ArchiveOpportunityDto,
  ) {
    return this.opportunitiesService.archive(id, archiveOpportunityDto);
  }
}
