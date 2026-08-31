import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';

import { Opportunity } from './entities/opportunity.entity';
import { OpportunityFile } from './entities/opportunity-file.entity';
import { OpportunityProduct } from './entities/opportunity-product.entity';
import { Client } from '../clients/entities/client.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Stage } from '../stages/entities/stage.entity';
import { OpportunitiesService } from './opportunities.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { OpportunitiesController } from './opportunities.controller';
import { Product } from '../products/entities/product.entity';
import { OpportunityLabel } from './entities/opportunity-label.entity';
import { OpportunityLabelsService } from './opportunity-labels.service';
import { OpportunityLabelsController } from './opportunity-labels.controller';
import { BusinessLineOption } from './entities/business-line-option.entity';
import { DeliveryTypeOption } from './entities/delivery-type-option.entity';
import { LicensingOption } from './entities/licensing-option.entity';
import { OpportunityCatalogsService } from './opportunity-catalogs.service';
import { OpportunityCatalogsController } from './opportunity-catalogs.controller';
import { PublicQuotationController } from './public-quotation.controller';
import { UsersModule } from 'src/users/users.module';
import { OpportunityTrackingsModule } from 'src/opportunity-trackings/opportunity-trackings.module';
import { ClientsModule } from 'src/clients/clients.module';
import { StorageModule } from '../storage/storage.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PipelinesModule } from '../pipelines/pipelines.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      Opportunity, Client, Pipeline, Stage, OpportunityFile, OpportunityProduct,
      Product, OpportunityLabel, BusinessLineOption, DeliveryTypeOption, LicensingOption,
    ]),
    UsersModule,
    OpportunityTrackingsModule,
    ClientsModule,
    StorageModule,
    InteractionsModule,
    NotificationsModule,
    PipelinesModule,
    // ConversationsModule ya NO se importa — QuotationPdfService usa EventEmitter

    // para comunicarse con ConversationsService, eliminando la circularidad

    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const opportunityId = req.params.id;
          const uploadPath = `./uploads/opportunities/${opportunityId}`;
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          // Decodificar el nombre del archivo para manejar correctamente
          // caracteres especiales (acentos, ñ, etc.)
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const uniqueName = `${Date.now()}-${decodedName}`;
          cb(null, uniqueName);
        },
      }),
    }),
  ],
  controllers: [OpportunitiesController, PublicQuotationController, OpportunityLabelsController, OpportunityCatalogsController],
  providers: [OpportunitiesService, QuotationPdfService, OpportunityLabelsService, OpportunityCatalogsService],
  exports: [OpportunitiesService, QuotationPdfService, OpportunityLabelsService, OpportunityCatalogsService],
})
export class OpportunitiesModule {}
