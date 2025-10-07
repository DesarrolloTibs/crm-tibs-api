import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';


import { UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { Role } from 'role.enum';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    const adminExists = await this.userRepository.findOne({ where: { email: 'ivonne.cabriales@tibs.com.mx' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('Admin2026!', 10);
      await this.userRepository.save({
        username: 'Ivonne Cabriales',
        password: hashedPassword,
        email: 'ivonne.cabriales@tibs.com.mx',
        isActive: true,
        role: Role.Admin,
      });
    }
  }

  async findOneByEmail(email: string): Promise<User> {
    console.log('Searching for user by email:', email);
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findOneById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(userData: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = this.userRepository.create(userData);
    user.password = hashedPassword;
    return this.userRepository.save(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    // Primero, asegúrate de que el usuario exista para evitar errores en la actualización.
    const userToUpdate = await this.findOneById(id);
    if (!userToUpdate) throw new NotFoundException(`Usuario con ID "${id}" no encontrado.`);

    await this.userRepository.update(id, updateUserDto);
    return this.findOneById(id);
  }

  async updateStatus(id: string, updateUserStatusDto: UpdateUserStatusDto): Promise<User> {
    const user = await this.findOneById(id);
    user.isActive = updateUserStatusDto.isActive;
    return this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findAllActive(): Promise<User[]> {
    return this.userRepository.find({ where: { isActive: true } });
  }

  /**
   * Actualiza la URL de la imagen de perfil de un usuario.
   * También elimina la imagen anterior del sistema de archivos si existe.
   * @param userId - El ID del usuario a actualizar.
   * @param imageUrl - La nueva URL de la imagen de perfil.
   * @returns La entidad del usuario actualizada.
   */
  async updateProfileImage(userId: string, imageUrl: string): Promise<User> {
    // Reutilizamos findOneById que ya maneja el caso de usuario no encontrado.
    const user = await this.findOneById(userId);
    user.profileImageUrl = imageUrl;
    return this.userRepository.save(user);
  }
}