import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';

import { UsersModule } from 'src/users/users.module';
import { Activity } from './entities/activity.entity';
import { InteractionsModule } from 'src/interactions/interactions.module';
import { TypeActivity } from './entities/type-activity.entity';
import { Client } from '../clients/entities/client.entity';
import { RemindersModule } from 'src/reminders/reminders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity, TypeActivity, Client]),
    UsersModule,
    InteractionsModule,
    RemindersModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule { }