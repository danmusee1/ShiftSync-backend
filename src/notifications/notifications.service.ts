import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateNotificationParams, db: Db = this.prisma): Promise<Notification> {
    return db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async createMany(paramsList: CreateNotificationParams[], db: Db = this.prisma): Promise<void> {
    if (paramsList.length === 0) return;
    await db.notification.createMany({
      data: paramsList.map((params) => ({
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  listForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId, isRead: unreadOnly ? false : undefined },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('This notification does not belong to you');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
