import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';

import { Product } from './entities/product.entity';
import { ProductFile } from './entities/product-file.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductFile]),
    StorageModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const productId = req.params.id;
          if (!productId) {
            return cb(new Error('Product ID is missing from parameters'), '');
          }

          // Distinguir la ruta de destino según la URL
          let uploadPath = `./uploads/products/${productId}`;
          if (req.originalUrl.includes('/cover-image') || req.url.includes('/cover-image')) {
            uploadPath = `./uploads/products/${productId}/cover`;
          }

          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          cb(null, `${Date.now()}-${decodedName}`);
        },
      }),
    }),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
