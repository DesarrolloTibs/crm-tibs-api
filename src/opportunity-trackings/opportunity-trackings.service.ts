
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunityTracking } from './entities/opportunity-tracking.entity';
import { CreateOpportunityTrackingDto } from './dto/create-opportunity-tracking.dto';

@Injectable()
export class OpportunityTrackingsService {
  constructor(
    @InjectRepository(OpportunityTracking)
    private opportunityTrackingRepository: Repository<OpportunityTracking>,
  ) {}

  create(createOpportunityTrackingDto: CreateOpportunityTrackingDto): Promise<OpportunityTracking> {
    const trackingRecord = this.opportunityTrackingRepository.create(createOpportunityTrackingDto);
    return this.opportunityTrackingRepository.save(trackingRecord);
  }
}
