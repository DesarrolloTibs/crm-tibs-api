import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';

import { UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Usuario creado exitosamente.', type: User })
  @ApiBody({ type: CreateUserDto })
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOkResponse({ description: 'Lista de todos los usuarios.', type: [User] })
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get('active')
  @ApiOkResponse({
    description: 'Lista de todos los usuarios activos.',
    type: [User],
  })
  findAllActive(): Promise<User[]> {
    return this.usersService.findAllActive();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Usuario encontrado.', type: User })
  async findOne(@Param('id') id: string): Promise<User> {
    const user = await this.usersService.findOneById(id);
    if (!user) {
      throw new NotFoundException(`Usuario con ID "${id}" no encontrado.`);
    }
    return user;
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Usuario actualizado exitosamente.', type: User })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ description: 'Estado del usuario actualizado exitosamente.', type: User })
  @ApiBody({ type: UpdateUserStatusDto })
  updateStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ): Promise<User> {
    return this.usersService.updateStatus(id, updateUserStatusDto);
  }

  @Post(':id/profile-image')
  @ApiOperation({ summary: 'Subir o actualizar la imagen de perfil para un usuario específico' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // El objeto 'file' está disponible gracias a Multer.
    // Su propiedad 'path' contiene la ruta donde se guardó el archivo.
    // Ahora pasamos el ID del usuario y la ruta del archivo al servicio.
    // Nota: Multer guarda la ruta con barras invertidas en Windows.
    // 1. Normalizamos las barras a '/'
    // 2. Nos aseguramos de que la ruta comience con '/' para que sea una URL relativa válida.
    const imageUrl = `/${file.path.replace(/\\/g, '/')}`;
    return this.usersService.updateProfileImage(id, imageUrl);
  }
}