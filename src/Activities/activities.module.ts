import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';

import { UsersModule } from 'src/users/users.module';
import { Activity } from './entities/activity.entity';
import { InteractionsModule } from 'src/interactions/interactions.module';
import { TypeActivity } from './entities/type-activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Activity, TypeActivity]), UsersModule, InteractionsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule { }