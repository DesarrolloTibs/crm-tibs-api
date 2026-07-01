import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { DashboardIndicator } from './entities/dashboard-indicator.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Helpdesk } from '../tickets/entities/helpdesk.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DashboardIndicator,
      Opportunity,
      Ticket,
      Activity,
      Pipeline,
      Helpdesk,
      User,
    ]),
    UsersModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
