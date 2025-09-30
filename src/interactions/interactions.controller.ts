import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  create(@Body() createInteractionDto: CreateInteractionDto) {
    return this.interactionsService.create(createInteractionDto);
  }

  @Get('opportunity/:opportunityId')
  findAllByOpportunity(@Param('opportunityId') opportunityId: string) {
    return this.interactionsService.findAllByOpportunity(opportunityId);
  }
}