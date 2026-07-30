import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailEventsListener } from './mail-events.listener';

@Module({
  imports: [ConfigModule],
  providers: [MailService, MailEventsListener],
  exports: [MailService],
})
export class MailModule {}
