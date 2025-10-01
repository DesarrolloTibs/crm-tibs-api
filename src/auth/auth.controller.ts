import { Controller, Post, UseGuards, Request } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
 
  @UseGuards(AuthGuard('local')) 
  @Post('login')
  @ApiBody({ type: LoginDto })
  async login(@Request() req:any) {
    // Si la estrategia LocalStrategy es exitosa, el objeto 'user'
    // se adjunta a la petición (request).
    return this.authService.login(req.user);
  }
}