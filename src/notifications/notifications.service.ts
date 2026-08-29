import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, type Notification, type NotificationType, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { MailQueueService } from '../mail/mail-queue.service.js';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly mailQueue: MailQueueService,
  ) {}

  // NOTE: db defaults to the app-wide client. If a caller ever passes an
  // in-flight transaction client here, the realtime emit/email below fire
  // before that transaction commits (and even if it later rolls back) — fine
  // for today's call sites, which never pass one, but worth knowing before reusing.
  async create(params: CreateNotificationParams, db: Db = this.prisma): Promise<Notification> {
    const notification = await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data as Prisma.InputJsonValue | undefined,
      },
    });
    this.realtime.emitToUser(params.userId, 'notification.new', notification);
    await this.maybeSendEmail(params);
    return notification;
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
    for (const params of paramsList) {
      this.realtime.emitToUser(params.userId, 'notification.new', params);
      await this.maybeSendEmail(params);
    }
  }

  private async maybeSendEmail(params: CreateNotificationParams): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true, notificationChannel: true },
    });
    if (user?.notificationChannel === NotificationChannel.IN_APP_AND_EMAIL) {
      await this.mailQueue.enqueueNotificationEmail({
        to: user.email,
        subject: params.title,
        body: params.body,
      });
    }
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
