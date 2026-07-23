import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { Role } from '../role.enum';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
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
    } catch (err) {
      // Ignorar si la BD no está lista en inicio
    }
  }

  private async ensureTenantUserColumns(tenantSchema: string) {
    if (tenantSchema === 'public') return;
    try {
      await this.dataSource.query(
        `ALTER TABLE "${tenantSchema}".users ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;
         ALTER TABLE "${tenantSchema}".users ADD COLUMN IF NOT EXISTS "profileImageUrl" varchar(500) NULL;`
      );
    } catch (err) {
      // Ignorar si ya existe
    }
  }

  async findOneByEmail(email: string): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, password, 'superadmin' as role, true as "isActive" FROM public.super_users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      if (rows.length > 0) return rows[0] as User;
    } else {
      await this.ensureTenantUserColumns(tenantSchema);
      const rows = await this.dataSource.query(
        `SELECT id, username, email, password, role, "isActive" FROM "${tenantSchema}".users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      if (rows.length > 0) return rows[0] as User;

      const suRows = await this.dataSource.query(
        `SELECT id, username, email, password, 'superadmin' as role, true as "isActive" FROM public.super_users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      if (suRows.length > 0) return suRows[0] as User;
    }
    throw new NotFoundException('Usuario no encontrado');
  }

  async findOneById(id: string): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, 'superadmin' as role, true as "isActive", created_at as "createdAt" FROM public.super_users WHERE id::text = $1`,
        [id]
      );
      if (rows.length > 0) return rows[0] as User;
    } else {
      await this.ensureTenantUserColumns(tenantSchema);
      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive", "profileImageUrl" FROM "${tenantSchema}".users WHERE id::text = $1`,
        [id]
      );
      if (rows.length > 0) return rows[0] as User;

      const suRows = await this.dataSource.query(
        `SELECT id, username, email, 'superadmin' as role, true as "isActive", created_at as "createdAt" FROM public.super_users WHERE id::text = $1`,
        [id]
      );
      if (suRows.length > 0) return suRows[0] as User;
    }
    throw new NotFoundException('Usuario no encontrado');
  }


  async create(userData: CreateUserDto): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    if (tenantSchema === 'public' || userData.role === Role.SuperAdmin) {
      const rows = await this.dataSource.query(
        `INSERT INTO public.super_users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, created_at as "createdAt"`,
        [userData.username, userData.email, hashedPassword]
      );
      const su = rows[0];
      return { ...su, role: Role.SuperAdmin, isActive: true } as User;
    }

    await this.ensureTenantUserColumns(tenantSchema);
    const roleToSet = userData.role || Role.Executive;
    const rows = await this.dataSource.query(
      `INSERT INTO "${tenantSchema}".users (username, email, password, role, "isActive") VALUES ($1, $2, $3, $4, true) RETURNING id, username, email, role, "isActive"`,
      [userData.username, userData.email, hashedPassword, roleToSet]
    );
    return rows[0] as User;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (tenantSchema === 'public') {
      if (updateUserDto.password) {
        await this.dataSource.query(
          `UPDATE public.super_users SET username = $1, email = $2, password = $3 WHERE id::text = $4`,
          [updateUserDto.username, updateUserDto.email, updateUserDto.password, id]
        );
      } else {
        await this.dataSource.query(
          `UPDATE public.super_users SET username = $1, email = $2 WHERE id::text = $3`,
          [updateUserDto.username, updateUserDto.email, id]
        );
      }
      return this.findOneById(id);
    }

    await this.ensureTenantUserColumns(tenantSchema);
    if (updateUserDto.password) {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET username = $1, email = $2, password = $3, role = $4 WHERE id::text = $5`,
        [updateUserDto.username, updateUserDto.email, updateUserDto.password, updateUserDto.role || 'executive', id]
      );
    } else {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET username = $1, email = $2, role = $3 WHERE id::text = $4`,
        [updateUserDto.username, updateUserDto.email, updateUserDto.role || 'executive', id]
      );
    }
    return this.findOneById(id);
  }

  async updateStatus(id: string, updateUserStatusDto: UpdateUserStatusDto): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema === 'public') {
      return this.findOneById(id);
    }
    await this.ensureTenantUserColumns(tenantSchema);
    await this.dataSource.query(
      `UPDATE "${tenantSchema}".users SET "isActive" = $1 WHERE id::text = $2`,
      [updateUserStatusDto.isActive, id]
    );
    return this.findOneById(id);
  }

  async findAll(): Promise<User[]> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, 'superadmin' as role, true as "isActive", created_at as "createdAt" FROM public.super_users ORDER BY created_at DESC`
      );
      return rows as User[];
    }
    await this.ensureTenantUserColumns(tenantSchema);
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive", "profileImageUrl" FROM "${tenantSchema}".users ORDER BY "createdAt" DESC`
    );
    return rows as User[];
  }

  async findAllActive(): Promise<User[]> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema === 'public') {
      return this.findAll();
    }
    await this.ensureTenantUserColumns(tenantSchema);
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive", "profileImageUrl" FROM "${tenantSchema}".users WHERE "isActive" = true ORDER BY "createdAt" DESC`
    );
    return rows as User[];
  }


  async updateProfileImage(userId: string, imageUrl: string): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema();
    if (tenantSchema !== 'public') {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET "profileImageUrl" = $1 WHERE id::text = $2`,
        [imageUrl, userId]
      );
    }
    return this.findOneById(userId);
  }

  async findOneByResetToken(token: string): Promise<User | null> {
    const tenantSchema = TenantContextService.getTenantSchema();
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive" FROM "${tenantSchema}".users WHERE reset_password_token = $1`,
      [token]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async save(user: User): Promise<User> {
    return user;
  }
}
