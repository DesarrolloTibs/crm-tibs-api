import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email', // Le decimos a Passport que use el campo 'email'
      passwordField: 'password', // Asegura que Passport busque el campo 'password'
    });
  }

  async validate(email: string, password: string): Promise<any> {
    console.log('LocalStrategy validate called with email:', email);
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}