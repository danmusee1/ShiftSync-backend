import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  AssignmentStatus,
  AuditAction,
  AuditEntityType,
  NotificationType,
  Role,
  SwapRequestStatus,
  SwapRequestType,
  type Shift,
  type ShiftAssignment,
  type SwapRequest,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import type { AppConfig } from '../config/configuration.js';
import { ConstraintEngineService } from '../scheduling/constraint-engine/constraint-engine.service.js';
import { ConstraintViolationException } from '../common/exceptions/constraint-violation.exception.js';
import { EXPIRE_DROP_JOB, SWAP_EXPIRY_QUEUE } from '../jobs/queue-names.js';
import { DecisionDto } from './dto/decision.dto.js';
import { RequestDropDto } from './dto/request-drop.dto.js';
import { RequestSwapDto } from './dto/request-swap.dto.js';

const ACTIVE_STATUSES: SwapRequestStatus[] = [
  SwapRequestStatus.PENDING,
  SwapRequestStatus.PENDING_TARGET,
  SwapRequestStatus.PENDING_MANAGER,
];

const swapRequestInclude = {
  initiatorAssignment: { include: { shift: true } },
  proposedReturnAssignment: { include: { shift: true } },
} as const;

@Injectable()
export class SwapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
    private readonly notifications: NotificationsService,
    private readonly constraintEngine: ConstraintEngineService,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectQueue(SWAP_EXPIRY_QUEUE) private readonly expiryQueue: Queue,
  ) {}

  async requestSwap(
    staffId: string,
    dto: RequestSwapDto,
    actor: AuthenticatedUser,
  ): Promise<SwapRequest> {
    this.assertSelfOrAdmin(staffId, actor);
    await this.assertBelowPendingCap(staffId);

    const initiatorAssignment = await this.getActiveAssignmentOrThrow(dto.shiftId, staffId);

    const target = await this.prisma.user.findUnique({ where: { id: dto.targetStaffId } });
    if (!target || target.role !== Role.STAFF || !target.isActive) {
      throw new BadRequestException('Target staff member not found');
    }
    if (target.id === staffId) {
      throw new BadRequestException('Cannot request a swap with yourself');
    }

    let proposedReturnAssignmentId: string | undefined;
    if (dto.proposedReturnShiftId) {
      const returnAssignment = await this.getActiveAssignmentOrThrow(
        dto.proposedReturnShiftId,
        dto.targetStaffId,
      );
      proposedReturnAssignmentId = returnAssignment.id;
    }

    const swapRequest = await this.prisma.swapRequest.create({
      data: {
        type: SwapRequestType.SWAP,
        status: SwapRequestStatus.PENDING_TARGET,
        initiatorId: staffId,
        initiatorAssignmentId: initiatorAssignment.id,
        counterpartyId: target.id,
        proposedReturnAssignmentId,
      },
    });

    await this.notifications.create({
      userId: target.id,
      type: NotificationType.SWAP_REQUESTED,
      title: 'New swap request',
      body: `${actor.firstName} ${actor.lastName} wants to swap a shift with you.`,
      data: { swapRequestId: swapRequest.id },
    });

    return swapRequest;
  }

  async requestDrop(
    staffId: string,
    dto: RequestDropDto,
    actor: AuthenticatedUser,
  ): Promise<SwapRequest> {
    this.assertSelfOrAdmin(staffId, actor);
    await this.assertBelowPendingCap(staffId);

    const initiatorAssignment = await this.getActiveAssignmentOrThrow(dto.shiftId, staffId);
    const shift = initiatorAssignment.shift;

    if (shift.startAt <= new Date()) {
      throw new BadRequestException('Cannot drop a shift that has already started');
    }

    // Normally expires N hours before the shift. If we're already inside that
    // window (a genuine last-minute call-out), it stays claimable right up
    // until the shift starts instead of being born already-expired.
    const expiryHours = this.configService.get('businessRules.dropRequestExpiryHoursBeforeShift', {
      infer: true,
    });
    const naturalExpiry = new Date(shift.startAt.getTime() - expiryHours * 3_600_000);
    const expiresAt = naturalExpiry > new Date() ? naturalExpiry : shift.startAt;

    const swapRequest = await this.prisma.swapRequest.create({
      data: {
        type: SwapRequestType.DROP,
        status: SwapRequestStatus.PENDING,
        initiatorId: staffId,
        initiatorAssignmentId: initiatorAssignment.id,
        expiresAt,
      },
    });

    await this.expiryQueue.add(
      EXPIRE_DROP_JOB,
      { swapRequestId: swapRequest.id },
      { jobId: swapRequest.id, delay: Math.max(0, expiresAt.getTime() - Date.now()) },
    );

    return swapRequest;
  }

  async acceptSwap(id: string, actor: AuthenticatedUser): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (request.type !== SwapRequestType.SWAP || request.status !== SwapRequestStatus.PENDING_TARGET) {
      throw new ConflictException('This swap request is not awaiting your response');
    }
    if (request.counterpartyId !== actor.id) {
      throw new ForbiddenException('This swap request was not sent to you');
    }

    if (request.proposedReturnAssignmentId) {
      const returnAssignment = await this.prisma.shiftAssignment.findUnique({
        where: { id: request.proposedReturnAssignmentId },
      });
      if (!returnAssignment || returnAssignment.status !== AssignmentStatus.ASSIGNED) {
        throw new ConflictException('Your side of this swap is no longer active');
      }
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: { status: SwapRequestStatus.PENDING_MANAGER, respondedAt: new Date() },
    });

    await this.notifyManagersAndInitiator(request, {
      initiatorType: NotificationType.SWAP_ACCEPTED,
      initiatorBody: `${actor.firstName} ${actor.lastName} accepted your swap request. Awaiting manager approval.`,
    });

    return updated;
  }

  async declineSwap(id: string, actor: AuthenticatedUser): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (request.type !== SwapRequestType.SWAP || request.status !== SwapRequestStatus.PENDING_TARGET) {
      throw new ConflictException('This swap request is not awaiting your response');
    }
    if (request.counterpartyId !== actor.id) {
      throw new ForbiddenException('This swap request was not sent to you');
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: { status: SwapRequestStatus.REJECTED, respondedAt: new Date() },
    });

    await this.notifications.create({
      userId: request.initiatorId,
      type: NotificationType.SWAP_DECLINED,
      title: 'Swap request declined',
      body: `${actor.firstName} ${actor.lastName} declined your swap request.`,
      data: { swapRequestId: id },
    });

    return updated;
  }

  async claimDrop(id: string, actor: AuthenticatedUser): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (request.type !== SwapRequestType.DROP || request.status !== SwapRequestStatus.PENDING) {
      throw new ConflictException('This shift is no longer available to claim');
    }
    if (request.initiatorId === actor.id) {
      throw new BadRequestException('You cannot claim your own dropped shift');
    }
    if (request.expiresAt && request.expiresAt <= new Date()) {
      throw new ConflictException('This drop request has expired');
    }

    const result = await this.constraintEngine.evaluateAssignment({
      staffId: actor.id,
      shift: request.initiatorAssignment.shift,
    });
    if (!result.ok) {
      throw new ConstraintViolationException(result.violations, result.suggestions);
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: {
        status: SwapRequestStatus.PENDING_MANAGER,
        counterpartyId: actor.id,
        respondedAt: new Date(),
      },
    });

    await this.notifyManagersAndInitiator(request, {
      initiatorType: NotificationType.DROP_CLAIMED,
      initiatorBody: `${actor.firstName} ${actor.lastName} claimed your dropped shift. Awaiting manager approval.`,
    });

    return updated;
  }

  async cancel(id: string, actor: AuthenticatedUser, dto: DecisionDto): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (!ACTIVE_STATUSES.includes(request.status)) {
      throw new ConflictException('This request has already been resolved');
    }
    const isParty = request.initiatorId === actor.id || request.counterpartyId === actor.id;
    if (!isParty && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('You are not a party to this request');
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: {
        status: SwapRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });

    await this.removeExpiryJob(id);

    const notifyIds = [request.initiatorId, request.counterpartyId].filter(
      (userId): userId is string => !!userId && userId !== actor.id,
    );
    await this.notifications.createMany(
      notifyIds.map((userId) => ({
        userId,
        type: NotificationType.SWAP_CANCELLED,
        title: 'Swap/drop request cancelled',
        body: `${actor.firstName} ${actor.lastName} cancelled this request.`,
        data: { swapRequestId: id },
      })),
    );

    return updated;
  }

  async managerApprove(id: string, actor: AuthenticatedUser): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (request.status !== SwapRequestStatus.PENDING_MANAGER || !request.counterpartyId) {
      throw new ConflictException('This request is not awaiting manager approval');
    }

    const shift = request.initiatorAssignment.shift;
    await this.locationAccess.assertManagerCanAccessLocation(actor, shift.locationId);

    await this.transferAssignment(shift, request.initiatorId, request.counterpartyId, actor);

    if (request.proposedReturnAssignmentId && request.proposedReturnAssignment) {
      const returnShift = request.proposedReturnAssignment.shift;
      await this.transferAssignment(returnShift, request.counterpartyId, request.initiatorId, actor);
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: {
        status: SwapRequestStatus.APPROVED,
        managerId: actor.id,
        managerDecisionAt: new Date(),
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.SWAP_REQUEST,
      entityId: id,
      action: AuditAction.APPROVE,
      actorId: actor.id,
      beforeState: request,
      afterState: updated,
      locationId: shift.locationId,
    });

    await this.notifications.createMany(
      [request.initiatorId, request.counterpartyId].map((userId) => ({
        userId,
        type: NotificationType.SWAP_APPROVED,
        title: 'Swap approved',
        body: `Your ${request.type === SwapRequestType.DROP ? 'drop' : 'swap'} request has been approved.`,
        data: { swapRequestId: id },
      })),
    );

    return updated;
  }

  async managerReject(id: string, dto: DecisionDto, actor: AuthenticatedUser): Promise<SwapRequest> {
    const request = await this.getOrThrow(id);
    if (request.status !== SwapRequestStatus.PENDING_MANAGER) {
      throw new ConflictException('This request is not awaiting manager approval');
    }

    await this.locationAccess.assertManagerCanAccessLocation(
      actor,
      request.initiatorAssignment.shift.locationId,
    );

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: {
        status: SwapRequestStatus.REJECTED,
        managerId: actor.id,
        managerDecisionAt: new Date(),
        managerReason: dto.reason,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.SWAP_REQUEST,
      entityId: id,
      action: AuditAction.REJECT,
      actorId: actor.id,
      beforeState: request,
      afterState: updated,
      reason: dto.reason,
      locationId: request.initiatorAssignment.shift.locationId,
    });

    const notifyIds = [request.initiatorId, request.counterpartyId].filter(
      (userId): userId is string => !!userId,
    );
    await this.notifications.createMany(
      notifyIds.map((userId) => ({
        userId,
        type: NotificationType.SWAP_REJECTED,
        title: 'Swap rejected',
        body: dto.reason ?? 'The manager rejected this request.',
        data: { swapRequestId: id },
      })),
    );

    return updated;
  }

  async listForStaff(staffId: string): Promise<SwapRequest[]> {
    return this.prisma.swapRequest.findMany({
      where: { OR: [{ initiatorId: staffId }, { counterpartyId: staffId }] },
      include: swapRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listOpenDrops(actor: AuthenticatedUser): Promise<SwapRequest[]> {
    const staffSkillIds =
      actor.role === Role.STAFF
        ? (
            await this.prisma.staffSkill.findMany({
              where: { staffId: actor.id },
              select: { skillId: true },
            })
          ).map((s) => s.skillId)
        : undefined;

    return this.prisma.swapRequest.findMany({
      where: {
        type: SwapRequestType.DROP,
        status: SwapRequestStatus.PENDING,
        initiatorId: { not: actor.id },
        initiatorAssignment: {
          shift: staffSkillIds ? { requiredSkillId: { in: staffSkillIds } } : undefined,
        },
      },
      include: swapRequestInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPendingForManager(actor: AuthenticatedUser): Promise<SwapRequest[]> {
    const locationFilter =
      actor.role === Role.MANAGER
        ? { in: await this.locationAccess.getManagerLocationIds(actor.id) }
        : undefined;

    return this.prisma.swapRequest.findMany({
      where: {
        status: SwapRequestStatus.PENDING_MANAGER,
        initiatorAssignment: locationFilter ? { shift: { locationId: locationFilter } } : undefined,
      },
      include: swapRequestInclude,
      orderBy: { requestedAt: 'asc' },
    });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const request = await this.getOrThrow(id);
    const isParty = request.initiatorId === actor.id || request.counterpartyId === actor.id;
    if (!isParty && actor.role !== Role.ADMIN) {
      await this.locationAccess.assertManagerCanAccessLocation(
        actor,
        request.initiatorAssignment.shift.locationId,
      );
    }
    return request;
  }

  /** Called by the BullMQ processor when a drop's expiry job fires. */
  async expireDropIfStillPending(id: string): Promise<void> {
    const request = await this.prisma.swapRequest.findUnique({ where: { id } });
    if (!request || request.status !== SwapRequestStatus.PENDING) return;

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: { status: SwapRequestStatus.EXPIRED },
    });

    await this.notifications.create({
      userId: request.initiatorId,
      type: NotificationType.DROP_EXPIRED,
      title: 'Drop request expired',
      body: 'Nobody claimed your dropped shift in time. Please coordinate coverage directly with your manager.',
      data: { swapRequestId: id },
    });

    await this.audit.record({
      entityType: AuditEntityType.SWAP_REQUEST,
      entityId: id,
      action: AuditAction.CANCEL,
      beforeState: request,
      afterState: updated,
    });
  }

  /**
   * Reassigns one shift from one staff member to another. Used only for
   * manager-approved swaps/drops, so — unlike the regular assign/unassign
   * endpoints — it deliberately does NOT enforce the publish-edit cutoff:
   * this workflow is the sanctioned path for exactly the last-minute
   * coverage changes that cutoff exists to otherwise prevent.
   */
  private async transferAssignment(
    shift: Shift,
    fromStaffId: string,
    toStaffId: string,
    actor: AuthenticatedUser,
  ): Promise<ShiftAssignment> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${toStaffId} FOR UPDATE`;

      const fromAssignment = await tx.shiftAssignment.findUnique({
        where: { shiftId_staffId: { shiftId: shift.id, staffId: fromStaffId } },
      });
      if (!fromAssignment || fromAssignment.status !== AssignmentStatus.ASSIGNED) {
        throw new ConflictException('The original assignment is no longer active');
      }

      const existingToAssignment = await tx.shiftAssignment.findUnique({
        where: { shiftId_staffId: { shiftId: shift.id, staffId: toStaffId } },
      });

      const result = await this.constraintEngine.evaluateAssignment(
        { staffId: toStaffId, shift, excludeAssignmentId: existingToAssignment?.id },
        tx,
      );
      if (!result.ok) {
        throw new ConstraintViolationException(result.violations, result.suggestions);
      }

      await tx.shiftAssignment.update({
        where: { id: fromAssignment.id },
        data: { status: AssignmentStatus.CANCELLED, cancelledAt: new Date() },
      });

      const toAssignment = existingToAssignment
        ? await tx.shiftAssignment.update({
            where: { id: existingToAssignment.id },
            data: {
              status: AssignmentStatus.ASSIGNED,
              assignedById: actor.id,
              assignedAt: new Date(),
              cancelledAt: null,
            },
          })
        : await tx.shiftAssignment.create({
            data: { shiftId: shift.id, staffId: toStaffId, assignedById: actor.id },
          });

      await this.audit.record(
        {
          entityType: AuditEntityType.SHIFT_ASSIGNMENT,
          entityId: toAssignment.id,
          action: AuditAction.ASSIGN,
          actorId: actor.id,
          beforeState: fromAssignment,
          afterState: toAssignment,
          locationId: shift.locationId,
        },
        tx,
      );

      return toAssignment;
    });
  }

  private async notifyManagersAndInitiator(
    request: SwapRequest & { initiatorAssignment: { shift: Shift } },
    params: { initiatorType: NotificationType; initiatorBody: string },
  ): Promise<void> {
    const managerIds = await this.prisma.managerLocation.findMany({
      where: { locationId: request.initiatorAssignment.shift.locationId },
      select: { managerId: true },
    });

    await this.notifications.createMany([
      {
        userId: request.initiatorId,
        type: params.initiatorType,
        title: 'Swap update',
        body: params.initiatorBody,
        data: { swapRequestId: request.id },
      },
      ...managerIds.map((m) => ({
        userId: m.managerId,
        type: NotificationType.MANAGER_APPROVAL_NEEDED,
        title: 'Swap/drop needs your approval',
        body: 'A staff-arranged coverage change is waiting on your approval.',
        data: { swapRequestId: request.id },
      })),
    ]);
  }

  private async removeExpiryJob(swapRequestId: string): Promise<void> {
    const job = await this.expiryQueue.getJob(swapRequestId);
    await job?.remove().catch(() => undefined);
  }

  private assertSelfOrAdmin(staffId: string, actor: AuthenticatedUser): void {
    if (actor.role === Role.ADMIN || actor.id === staffId) return;
    throw new ForbiddenException('Only the staff member (or an admin) may do this');
  }

  private async assertBelowPendingCap(staffId: string): Promise<void> {
    const max = this.configService.get('businessRules.maxPendingSwapRequestsPerStaff', {
      infer: true,
    });
    const count = await this.prisma.swapRequest.count({
      where: { initiatorId: staffId, status: { in: ACTIVE_STATUSES } },
    });
    if (count >= max) {
      throw new ConflictException(
        `You already have ${count} pending swap/drop requests (max ${max}). Cancel one before creating another.`,
      );
    }
  }

  private async getActiveAssignmentOrThrow(shiftId: string, staffId: string) {
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { shiftId_staffId: { shiftId, staffId } },
      include: { shift: true },
    });
    if (!assignment || assignment.status !== AssignmentStatus.ASSIGNED) {
      throw new NotFoundException('No active assignment found for this shift');
    }
    return assignment;
  }

  private async getOrThrow(id: string) {
    const request = await this.prisma.swapRequest.findUnique({
      where: { id },
      include: swapRequestInclude,
    });
    if (!request) {
      throw new NotFoundException('Swap request not found');
    }
    return request;
  }
}
