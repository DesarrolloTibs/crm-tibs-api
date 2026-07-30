import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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


    // 2. Si no es SuperAdmin, validar en esquemas locales de tenant (roles: admin y executive)
    try {
      const user = await this.usersService.findOneByEmail(email);
      if (user && user.isActive === false) {
        throw new BadRequestException('Su cuenta se encuentra inactiva.');
      }
      const isMatch = user && (await bcrypt.compare(pass, user.password));

      if (isMatch) {
        const { password, ...result } = user;
        return result;
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Usuario local no encontrado
    }

    return null;
  }

  async login(user: any) {
    const payload = { 
      username: user.username, 
      sub: user.id, 
      role: user.role,
      tenant: user.tenant || undefined,
    };
    return {
      access_token: this.jwtService.sign(payload),
      role: user.role,
    };
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