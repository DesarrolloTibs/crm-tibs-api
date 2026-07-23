import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionHistory } from './entities/transaction-history.entity';
import { SubscriptionValidatorService } from './subscription-validator.service';
import { SubscriptionRenewalCron } from './subscription-renewal.cron';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionHistory])],
  providers: [SubscriptionValidatorService, SubscriptionRenewalCron],
  exports: [SubscriptionValidatorService],
})
export class SubscriptionsModule {}
