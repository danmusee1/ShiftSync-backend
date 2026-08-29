import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';

/**
 * Centralizes the "managers only see/manage locations they're assigned to"
 * rule so every module (users, scheduling, availability, swaps, audit)
 * enforces it identically instead of re-deriving it per-controller.
 */
@Injectable()
export class LocationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getManagerLocationIds(managerId: string): Promise<string[]> {
    const rows = await this.prisma.managerLocation.findMany({
      where: { managerId },
      select: { locationId: true },
    });
    return rows.map((r) => r.locationId);
  }

  /** Throws unless the user is an admin or a manager assigned to this location. */
  async assertManagerCanAccessLocation(
    user: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    if (user.role === Role.ADMIN) return;

    if (user.role === Role.MANAGER) {
      const link = await this.prisma.managerLocation.findUnique({
        where: { managerId_locationId: { managerId: user.id, locationId } },
      });
      if (link) return;
    }

    throw new ForbiddenException('You do not have access to this location');
  }

  /**
   * Throws unless the user is an admin, is the staff member themself, or is a
   * manager who shares at least one currently-certified location with them.
   */
  async assertCanAccessStaff(user: AuthenticatedUser, staffId: string): Promise<void> {
    if (user.role === Role.ADMIN || user.id === staffId) return;

    if (user.role === Role.MANAGER) {
      const sharedLocation = await this.prisma.staffLocation.findFirst({
        where: {
          staffId,
          decertifiedAt: null,
          location: { managerLocations: { some: { managerId: user.id } } },
        },
      });
      if (sharedLocation) return;
    }

    throw new ForbiddenException('You do not have access to this staff member');
  }
}
