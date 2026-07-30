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
      // 1. Asegurar extensión pgvector en esquema public de Supabase y otorgar accesos globales
      try {
        await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;`);
        await this.dataSource.query(`GRANT USAGE ON SCHEMA public TO PUBLIC;`);
      } catch (e) {}

      // 2. Asegurar que en public.users exista el usuario SuperAdmin por defecto
      const adminExists = await this.dataSource.query(
        `SELECT id FROM public.users WHERE LOWER(email) = LOWER($1) OR role = 'superadmin'`,
        ['jonathan.amador@tibs.com.mx']
      );
      if (!adminExists || adminExists.length === 0) {
        const hashedPassword = await bcrypt.hash('12345678', 10);
        await this.dataSource.query(
          `INSERT INTO public.users (username, email, password, role, "isActive")
           VALUES ('Jonathan Amador', 'jonathan.amador@tibs.com.mx', $1, 'superadmin', true)`,
          [hashedPassword]
        );
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
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, password, role, "isActive" FROM public.users WHERE LOWER(email) = LOWER($1) AND role = 'superadmin'`,
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
        `SELECT id, username, email, password, role, "isActive" FROM public.users WHERE LOWER(email) = LOWER($1) AND role = 'superadmin'`,
        [email]
      );
      if (suRows.length > 0) return suRows[0] as User;
    }
    throw new NotFoundException('Usuario no encontrado');
  }

  async findOneById(id: string): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive" FROM public.users WHERE id::text = $1 AND role = 'superadmin'`,
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
        `SELECT id, username, email, role, "isActive" FROM public.users WHERE id::text = $1 AND role = 'superadmin'`,
        [id]
      );
      if (suRows.length > 0) return suRows[0] as User;
    }
    throw new NotFoundException('Usuario no encontrado');
  }

  async create(userData: CreateUserDto): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    if (tenantSchema === 'public' || userData.role === Role.SuperAdmin || (userData.role as any) === 'superadmin') {
      const rows = await this.dataSource.query(
        `INSERT INTO public.users (username, email, password, role, "isActive") VALUES ($1, $2, $3, 'superadmin', true) RETURNING id, username, email, role, "isActive"`,
        [userData.username, userData.email, hashedPassword]
      );
      return rows[0] as User;
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
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (tenantSchema === 'public') {
      if (updateUserDto.password) {
        await this.dataSource.query(
          `UPDATE public.users SET username = $1, email = $2, password = $3, role = 'superadmin' WHERE id::text = $4`,
          [updateUserDto.username, updateUserDto.email, updateUserDto.password, id]
        );
      } else {
        await this.dataSource.query(
          `UPDATE public.users SET username = $1, email = $2, role = 'superadmin' WHERE id::text = $3`,
          [updateUserDto.username, updateUserDto.email, id]
        );
      }
      return this.findOneById(id);
    }

    await this.ensureTenantUserColumns(tenantSchema);
    let roleToSet = updateUserDto.role || Role.Executive;
    if ((roleToSet as any) === 'superadmin' || roleToSet === Role.SuperAdmin) {
      roleToSet = Role.Executive;
    }

    if (updateUserDto.password) {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET username = $1, email = $2, password = $3, role = $4 WHERE id::text = $5`,
        [updateUserDto.username, updateUserDto.email, updateUserDto.password, roleToSet, id]
      );
    } else {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET username = $1, email = $2, role = $3 WHERE id::text = $4`,
        [updateUserDto.username, updateUserDto.email, roleToSet, id]
      );
    }
    if (updateUserDto.profileImageUrl !== undefined) {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET "profileImageUrl" = $1 WHERE id::text = $2`,
        [updateUserDto.profileImageUrl, id]
      );
    }
    return this.findOneById(id);
  }

  async updateStatus(id: string, updateUserStatusDto: UpdateUserStatusDto): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      await this.dataSource.query(
        `UPDATE public.users SET "isActive" = $1 WHERE id::text = $2 AND LOWER(role::text) = 'superadmin'`,
        [updateUserStatusDto.isActive, id]
      );
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
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive" FROM public.users WHERE LOWER(role::text) = 'superadmin' ORDER BY id DESC`
      );
      return rows as User[];
    }
    await this.ensureTenantUserColumns(tenantSchema);
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive", "profileImageUrl" FROM "${tenantSchema}".users WHERE LOWER(role::text) != 'superadmin' ORDER BY id DESC`
    );
    return rows as User[];
  }

  async findAllActive(): Promise<User[]> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive" FROM public.users WHERE "isActive" = true AND LOWER(role::text) = 'superadmin' ORDER BY id DESC`
      );
      return rows as User[];
    }
    await this.ensureTenantUserColumns(tenantSchema);
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive", "profileImageUrl" FROM "${tenantSchema}".users WHERE "isActive" = true AND LOWER(role::text) != 'superadmin' ORDER BY id DESC`
    );
    return rows as User[];
  }



  async remove(id: string): Promise<void> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema === 'public') {
      await this.dataSource.query(
        `DELETE FROM public.users WHERE id::text = $1 AND role = 'superadmin'`,
        [id]
      );
    } else {
      await this.dataSource.query(
        `DELETE FROM "${tenantSchema}".users WHERE id::text = $1`,
        [id]
      );
    }
  }

  async updateProfileImage(userId: string, imageUrl: string): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    if (tenantSchema !== 'public') {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET "profileImageUrl" = $1 WHERE id::text = $2`,
        [imageUrl, userId]
      );
    }
    return this.findOneById(userId);
  }

  async findOneByResetToken(token: string): Promise<User | null> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const rows = await this.dataSource.query(
      `SELECT id, username, email, role, "isActive" FROM "${tenantSchema}".users WHERE reset_password_token = $1`,
      [token]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async save(user: User): Promise<User> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const userId = user.id;

    if (!userId) return user;

    if (tenantSchema === 'public') {
      await this.dataSource.query(
        `UPDATE public.users SET 
           username = $1, 
           email = $2, 
           password = $3, 
           reset_password_token = $4, 
           reset_password_expires = $5
         WHERE id::text = $6`,
        [user.username, user.email, user.password, user.resetPasswordToken || null, user.resetPasswordExpires || null, userId]
      );
    } else {
      await this.dataSource.query(
        `UPDATE "${tenantSchema}".users SET 
           username = $1, 
           email = $2, 
           password = $3, 
           reset_password_token = $4, 
           reset_password_expires = $5
         WHERE id::text = $6`,
        [user.username, user.email, user.password, user.resetPasswordToken || null, user.resetPasswordExpires || null, userId]
      );
    }

    return user;
  }
}


