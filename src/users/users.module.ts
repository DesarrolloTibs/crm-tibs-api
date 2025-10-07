import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // Configuración de Multer para la subida de imágenes de perfil
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // El ID del usuario viene en los parámetros de la ruta
          const userId = (req.params as any).id;
          if (!userId) {
            return cb(new Error('User ID is missing from parameters'), '');
          }
          const uploadPath = `./uploads/users/${userId}`;
          // Crear el directorio si no existe
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
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
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}