import { NotificationType, SwapRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const ACTIVE_STATUSES: SwapRequestStatus[] = [
  SwapRequestStatus.PENDING,
  SwapRequestStatus.PENDING_TARGET,
  SwapRequestStatus.PENDING_MANAGER,
];

/**
 * "If a swap is pending and the manager edits that shift, the swap request
 * should be automatically cancelled with notification." Called whenever a
 * shift is edited or a staff member is unassigned from it.
 */
export async function cancelPendingSwapsForAssignments(
  prisma: PrismaService,
  notifications: NotificationsService,
  assignmentIds: string[],
  reason: string,
): Promise<void> {
  if (assignmentIds.length === 0) return;

  const affected = await prisma.swapRequest.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      OR: [
        { initiatorAssignmentId: { in: assignmentIds } },
        { proposedReturnAssignmentId: { in: assignmentIds } },
      ],
    },
  });
  if (affected.length === 0) return;

  await prisma.swapRequest.updateMany({
    where: { id: { in: affected.map((r) => r.id) } },
    data: { status: SwapRequestStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
  });

  const userIds = new Set<string>();
  for (const request of affected) {
    userIds.add(request.initiatorId);
    if (request.counterpartyId) userIds.add(request.counterpartyId);
  }

  await notifications.createMany(
    [...userIds].map((userId) => ({
      userId,
      type: NotificationType.SWAP_CANCELLED,
      title: 'Swap/drop request cancelled',
      body: reason,
      data: {},
    })),
  );
}
