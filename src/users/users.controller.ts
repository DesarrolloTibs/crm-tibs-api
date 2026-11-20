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
  ForbiddenException,
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
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../role.enum';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private isAdminOrSuperAdmin(user?: User): boolean {
    const role = (user?.role || '').toString().toLowerCase().trim();
    return role === Role.Admin || role === Role.SuperAdmin;
  }

  private ensureAdminOrSuperAdmin(user?: User): void {
    if (!this.isAdminOrSuperAdmin(user)) {
      throw new ForbiddenException('Solo los administradores pueden gestionar usuarios.');
    }
  }

  @Post()
  @ApiCreatedResponse({ description: 'Usuario creado exitosamente.', type: User })
  @ApiBody({ type: CreateUserDto })
  create(@Body() createUserDto: CreateUserDto, @GetUser() currentUser: User): Promise<User> {
    this.ensureAdminOrSuperAdmin(currentUser);
    return this.usersService.create(createUserDto, currentUser);
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
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    const user = await this.usersService.findOneById(id);
    if (!user) {
      throw new NotFoundException(`Usuario con ID "${id}" no encontrado.`);
    }
    return user;
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Usuario actualizado exitosamente.', type: User })
  @ApiBody({ type: UpdateUserDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() currentUser: User,
  ): Promise<User> {
    const currentId = currentUser?.id || (currentUser as any)?.userId;
    const isPrivileged = this.isAdminOrSuperAdmin(currentUser);
    if (!isPrivileged) {
      if (currentId !== id) {
        throw new ForbiddenException('No tienes permiso para modificar a otro usuario.');
      }
      if (updateUserDto.role !== undefined || updateUserDto.isActive !== undefined) {
        throw new ForbiddenException('No tienes permiso para cambiar tu rol o estatus.');
      }
    }
    return this.usersService.update(id, updateUserDto, currentUser);
  }

  @Patch(':id/status')
  @ApiOkResponse({ description: 'Estado del usuario actualizado exitosamente.', type: User })
  @ApiBody({ type: UpdateUserStatusDto })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
    @GetUser() currentUser: User,
  ): Promise<User> {
    this.ensureAdminOrSuperAdmin(currentUser);
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
    @GetUser() currentUser: User,
  ) {
    const currentId = currentUser?.id || (currentUser as any)?.userId;
    if (!this.isAdminOrSuperAdmin(currentUser) && currentId !== id) {
      throw new ForbiddenException('No tienes permiso para modificar la foto de perfil de otro usuario.');
    }
    return this.usersService.uploadProfileImageFile(id, file);
  }
}