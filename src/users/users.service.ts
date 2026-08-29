import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditEntityType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { sanitizeUser, type UserResponse } from './user-response.mapper.js';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async create(dto: CreateUserDto, actor: AuthenticatedUser): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        homeTimezone: dto.homeTimezone,
        notificationChannel: dto.notificationChannel,
        desiredWeeklyHours: dto.desiredWeeklyHours,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.USER,
      entityId: user.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  async findAll(actor: AuthenticatedUser, role?: Role): Promise<UserResponse[]> {
    if (actor.role === Role.ADMIN) {
      const users = await this.prisma.user.findMany({
        where: { role },
        orderBy: { createdAt: 'asc' },
      });
      return users.map(sanitizeUser);
    }

    // Managers only see staff certified at their locations (plus themselves).
    const managerLocationIds = await this.locationAccess.getManagerLocationIds(actor.id);
    const users = await this.prisma.user.findMany({
      where: {
        role: role ?? Role.STAFF,
        OR: [
          { id: actor.id },
          {
            staffLocations: {
              some: { decertifiedAt: null, locationId: { in: managerLocationIds } },
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(sanitizeUser);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<UserResponse> {
    await this.locationAccess.assertCanAccessStaff(actor, id);
    const user = await this.getOrThrow(id);
    return sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserResponse> {
    const before = await this.getOrThrow(id);

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS)
      : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        homeTimezone: dto.homeTimezone,
        notificationChannel: dto.notificationChannel,
        desiredWeeklyHours: dto.desiredWeeklyHours,
        passwordHash,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.USER,
      entityId: user.id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      beforeState: sanitizeUser(before),
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return sanitizeUser(user);
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser): Promise<UserResponse> {
    const before = await this.getOrThrow(id);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { isActive } });
      if (!isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });

    await this.audit.record({
      entityType: AuditEntityType.USER,
      entityId: user.id,
      action: isActive ? AuditAction.UPDATE : AuditAction.DELETE,
      actorId: actor.id,
      beforeState: sanitizeUser(before),
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  private async getOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
