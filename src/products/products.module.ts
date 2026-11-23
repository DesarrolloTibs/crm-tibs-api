import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { Product } from './entities/product.entity';
import { ProductFile } from './entities/product-file.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StorageModule } from '../storage/storage.module';
import { RagModule } from '../rag/rag.module';
import {
  assertSafeUploadParamId,
  createDiskMulterOptions,
} from '../common/utils/upload.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductFile]),
    StorageModule,
    RagModule,
    MulterModule.register(
      createDiskMulterOptions({
        resolveDestination: (req) => {
          const productId = assertSafeUploadParamId(req.params?.id, 'Product ID');
          const isCover =
            req.originalUrl?.includes('/cover-image') || req.url?.includes('/cover-image');
          return isCover
            ? `./uploads/products/${productId}/cover`
            : `./uploads/products/${productId}`;
        },
        mode: (req) =>
          req.originalUrl?.includes('/cover-image') || req.url?.includes('/cover-image')
            ? 'image'
            : 'document_or_image',
        maxFileSizeBytes: 20 * 1024 * 1024,
      }),
    ),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
