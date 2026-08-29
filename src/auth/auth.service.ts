import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { AppConfig } from '../config/configuration.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseDurationMs } from '../common/utils/duration.util.js';
import { hashToken } from './token-hash.util.js';
import type { AuthenticatedUser, JwtPayload } from './types/authenticated-user.type.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async validateCredentials(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async login(user: AuthenticatedUser): Promise<LoginResult> {
    const tokens = await this.issueTokens(user);
    return { ...tokens, user };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user: AuthenticatedUser = {
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
      firstName: stored.user.firstName,
      lastName: stored.user.lastName,
    };

    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: AuthenticatedUser): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('jwt.accessSecret', { infer: true }),
      expiresIn: this.configService.get('jwt.accessTtl', { infer: true }),
    });

    const refreshToken = randomUUID() + randomUUID();
    const refreshTtl = this.configService.get('jwt.refreshTtl', { infer: true });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshTtl)),
      },
    });

    return { accessToken, refreshToken };
  }
}
