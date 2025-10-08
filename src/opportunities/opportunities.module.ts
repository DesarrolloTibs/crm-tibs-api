import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';

import { Opportunity } from './entities/opportunity.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity]),
    UsersModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const opportunityId = req.params.id;
          const uploadPath = `./uploads/${opportunityId}`;
          // Asegurarse de que el directorio de destino exista
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          // Decodificar el nombre del archivo para manejar correctamente caracteres especiales (acentos, ñ, etc.)
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          cb(null, decodedName);
        },
      }),
    }),
  ],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
})
export class OpportunitiesModule {}