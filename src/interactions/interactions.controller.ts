import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { ApiTags, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('interactions')
@ApiBearerAuth()
@Controller('interactions')
@UseGuards(AuthGuard('jwt'))
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @ApiBody({ type: CreateInteractionDto })
  create(@Body() createInteractionDto: CreateInteractionDto) {
    return this.interactionsService.create(createInteractionDto);
  }

  @Get('opportunity/:opportunityId')
  @ApiParam({ name: 'opportunityId', type: String, description: 'ID de la oportunidad' })
  findAllByOpportunity(@Param('opportunityId') opportunityId: string) {
    return this.interactionsService.findAllByOpportunity(opportunityId);
  }
}