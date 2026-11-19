import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionHistory } from './entities/transaction-history.entity';
import { AudioTranscriptionLog } from './entities/audio-transcription-log.entity';
import { SubscriptionValidatorService } from './subscription-validator.service';
import { SubscriptionRenewalCron } from './subscription-renewal.cron';
import { TenantConcurrencyService } from './tenant-concurrency.service';
import { AudioAuditService } from './audio-audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionHistory, AudioTranscriptionLog])],
  providers: [SubscriptionValidatorService, SubscriptionRenewalCron, TenantConcurrencyService, AudioAuditService],
  exports: [SubscriptionValidatorService, TenantConcurrencyService, AudioAuditService],
})
export class SubscriptionsModule {}
