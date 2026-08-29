import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../config/configuration.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

// PassportModule only binds its AuthModuleOptions provider when configured via
// .register()/.registerAsync() — re-export this exact configured instance
// (not the bare class) so JwtAuthGuard resolves everywhere it's used.
const passportModule = PassportModule.register({ defaultStrategy: 'jwt' });

const jwtModule = JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService<AppConfig, true>) => ({
    secret: configService.get('jwt.accessSecret', { infer: true }),
    signOptions: { expiresIn: configService.get('jwt.accessTtl', { infer: true }) },
  }),
});

// Global: JwtAuthGuard/RolesGuard are applied via @UseGuards() across every
// feature module's controllers, so the passport machinery they depend on
// (AuthModuleOptions, the registered 'jwt' strategy) must be app-wide. Other
// modules (e.g. RealtimeGateway, to verify socket handshake tokens) also need
// JwtService, hence exporting jwtModule too.
@Global()
@Module({
  imports: [passportModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, passportModule, jwtModule],
})
export class AuthModule {}
