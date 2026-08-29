import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
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

  async exportToXlsx(filter: { locationId?: string; from?: Date; to?: Date }): Promise<Buffer> {
    const logs = await this.findForExport(filter);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Log');
    sheet.columns = [
      { header: 'Timestamp (UTC)', key: 'createdAt', width: 22 },
      { header: 'Entity Type', key: 'entityType', width: 18 },
      { header: 'Entity ID', key: 'entityId', width: 38 },
      { header: 'Action', key: 'action', width: 14 },
      { header: 'Actor', key: 'actor', width: 28 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Before', key: 'before', width: 50 },
      { header: 'After', key: 'after', width: 50 },
    ];

    for (const log of logs) {
      sheet.addRow({
        createdAt: log.createdAt.toISOString(),
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        actor: log.actor ? `${log.actor.firstName} ${log.actor.lastName} (${log.actor.email})` : 'system',
        location: log.location?.name ?? '',
        reason: log.reason ?? '',
        before: log.beforeState ? JSON.stringify(log.beforeState) : '',
        after: log.afterState ? JSON.stringify(log.afterState) : '',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
