import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { StorageModule } from '../storage/storage.module';
import {
  assertSafeUploadParamId,
  createDiskMulterOptions,
} from '../common/utils/upload.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    StorageModule,
    // Configuración de Multer para la subida de imágenes de perfil
    MulterModule.register(
      createDiskMulterOptions({
        resolveDestination: (req) => {
          const userId = assertSafeUploadParamId((req.params as any)?.id, 'User ID');
          return `./uploads/users/${userId}`;
        },
        mode: 'image',
        maxFileSizeBytes: 10 * 1024 * 1024,
      }),
    ),
  ],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}