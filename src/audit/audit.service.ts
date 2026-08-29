import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RecordAuditParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
  locationId?: string | null;
}

/**
 * Every mutation to a scheduling-relevant entity should call `record()` in the
 * same Prisma transaction as the mutation itself, so the audit trail can never
 * drift from what actually happened.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    params: RecordAuditParams,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId ?? null,
        beforeState: toJsonInput(params.beforeState),
        afterState: toJsonInput(params.afterState),
        reason: params.reason,
        locationId: params.locationId ?? null,
      },
    });
  }

  findForEntity(entityType: AuditEntityType, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  findForExport(filter: { locationId?: string; from?: Date; to?: Date }) {
    return this.prisma.auditLog.findMany({
      where: {
        locationId: filter.locationId,
        createdAt: {
          gte: filter.from,
          lte: filter.to,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
