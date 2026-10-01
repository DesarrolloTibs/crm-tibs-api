import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    this.logger.debug('Validating user');

    // 1. Verificar primero en el esquema public (public.users) para cuentas de SuperAdmin
    try {
      const publicUsers = await this.dataSource.query(
        `SELECT id, username, email, password, role, "isActive" FROM public.users WHERE LOWER(email) = LOWER($1) AND role = 'superadmin'`,
        [email]
      );
      if (publicUsers.length > 0) {
        const su = publicUsers[0];
        if (su.isActive === false) {
          throw new BadRequestException('La cuenta de superadmin está inactiva. Contacte a un administrador.');
        }
        if (await bcrypt.compare(pass, su.password)) {
          return {
            id: su.id,
            username: su.username,
            email: su.email,
            role: 'superadmin',
            tenant: 'public',
          };
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Ignorar si la tabla no se ha creado aún
    }


    // 2. Si no es SuperAdmin, buscar al usuario a través de los esquemas de tenants activos
    try {
      const activeTenants = await this.dataSource.query(
        `SELECT schema_name FROM public.tenants WHERE is_active = true`
      ).catch(() => []);

      for (const t of activeTenants) {
        try {
          const rows = await this.dataSource.query(
            `SELECT id, username, email, password, role, "isActive" FROM "${t.schema_name}".users WHERE LOWER(email) = LOWER($1)`,
            [email]
          );
          if (rows && rows.length > 0) {
            const user = rows[0];
            if (user.isActive === false) {
              throw new BadRequestException('Su cuenta se encuentra inactiva.');
            }
            if (await bcrypt.compare(pass, user.password)) {
              return {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                tenant: t.schema_name,
              };
            }
          }
        } catch (tenantErr) {
          if (tenantErr instanceof BadRequestException) throw tenantErr;
          // Ignorar esquemas inaccesibles
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
    }

    return null;
  }

  async login(user: any) {
    const payload = { 
      username: user.username, 
      sub: user.id, 
      role: user.role,
      tenant: user.tenant || undefined,
      type: 'access',
    };

    const refreshPayload = {
      username: user.username,
      sub: user.id,
      role: user.role,
      tenant: user.tenant || undefined,
      type: 'refresh',
    };

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || `${this.configService.get<string>('JWT_SECRET')}_refresh`;
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRATION_TIME') || '30d';

    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(refreshPayload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
    });

    return {
      access_token,
      refresh_token,
      role: user.role,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tenant: user.tenant || 'public',
      },
    };
  }

  async refreshToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('El refresh_token es requerido.');
    }

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || `${this.configService.get<string>('JWT_SECRET')}_refresh`;

    let decoded: any;
    try {
      decoded = this.jwtService.verify(token, { secret: refreshSecret });
    } catch (err: any) {
      this.logger.warn(`Fallo al verificar refresh token: ${err.message}`);
      throw new UnauthorizedException('Token de actualización inválido o expirado.');
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException('Tipo de token no válido para actualización.');
    }

    const userId = decoded.sub;
    const tenant = decoded.tenant || 'public';
    let userRecord: any = null;

    if (decoded.role === 'superadmin' || tenant === 'public') {
      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive" FROM public.users WHERE id = $1`,
        [userId],
      ).catch(() => []);
      if (rows && rows.length > 0) {
        userRecord = rows[0];
        userRecord.tenant = 'public';
      }
    } else {
      const tenantCheck = await this.dataSource.query(
        `SELECT is_active FROM public.tenants WHERE schema_name = $1`,
        [tenant],
      ).catch(() => []);

      if (!tenantCheck || tenantCheck.length === 0 || !tenantCheck[0].is_active) {
        throw new UnauthorizedException('La organización asociada al token se encuentra inactiva.');
      }

      const rows = await this.dataSource.query(
        `SELECT id, username, email, role, "isActive" FROM "${tenant}".users WHERE id = $1`,
        [userId],
      ).catch(() => []);
      if (rows && rows.length > 0) {
        userRecord = rows[0];
        userRecord.tenant = tenant;
      }
    }

    if (!userRecord) {
      throw new UnauthorizedException('El usuario asociado al token ya no existe.');
    }

    if (userRecord.isActive === false) {
      throw new UnauthorizedException('La cuenta de usuario se encuentra inactiva.');
    }

    return this.login(userRecord);
  }


  async forgotPassword(email: string): Promise<void> {
    try {
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        // Por seguridad, no revelamos si el email existe
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date();
      expires.setHours(expires.getHours() + 1); // 1 hora de validez

      user.resetPasswordToken = token;
      user.resetPasswordExpires = expires;

      await this.usersService.save(user);
      await this.mailService.sendResetPasswordEmail(user.email, token, user.username);
    } catch (error) {
      // Si el usuario no se encuentra, findOneByEmail lanza NotFoundException
      if (error instanceof NotFoundException) return;
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findOneByResetToken(token);

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('El token es inválido o ha expirado');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await this.usersService.save(user);
  }
}