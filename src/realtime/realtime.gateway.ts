import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfig } from '../config/configuration.js';
import type { JwtPayload } from '../auth/types/authenticated-user.type.js';

/**
 * Rooms: `user:<id>` for personal notifications, `location:<id>` for
 * schedule/on-duty broadcasts to everyone with a stake in that location.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });

      await client.join(`user:${payload.sub}`);

      const [managerLocations, staffLocations] = await Promise.all([
        this.prisma.managerLocation.findMany({
          where: { managerId: payload.sub },
          select: { locationId: true },
        }),
        this.prisma.staffLocation.findMany({
          where: { staffId: payload.sub, decertifiedAt: null },
          select: { locationId: true },
        }),
      ]);
      for (const { locationId } of [...managerLocations, ...staffLocations]) {
        await client.join(`location:${locationId}`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO cleans up room membership automatically on disconnect.
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToLocation(locationId: string, event: string, payload: unknown): void {
    this.server?.to(`location:${locationId}`).emit(event, payload);
  }

  private extractToken(client: Socket): string {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    const header = client.handshake.headers.authorization;
    const fromHeader = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = fromAuth ?? fromHeader;
    if (!token) throw new Error('No token provided');
    return token;
  }
}
