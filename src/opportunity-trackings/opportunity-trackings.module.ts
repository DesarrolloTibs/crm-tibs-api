
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunityTracking } from './entities/opportunity-tracking.entity';
import { OpportunityTrackingsService } from './opportunity-trackings.service';
import { OpportunityTrackingsController } from './opportunity-trackings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OpportunityTracking])],
  providers: [OpportunityTrackingsService],
  exports: [OpportunityTrackingsService],
  controllers: [OpportunityTrackingsController],
})
export class OpportunityTrackingsModule {}
