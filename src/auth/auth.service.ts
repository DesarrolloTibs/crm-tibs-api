import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    console.log('Validating user with email:', email);
    const user = await this.usersService.findOneByEmail(email);
    // Compara la contraseña proporcionada con el hash almacenado en la BD
    const isMatch = user && (await bcrypt.compare(pass, user.password));

    if (isMatch) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.id, role: user.role };
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
      await this.mailService.sendResetPasswordEmail(user.email, token);
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