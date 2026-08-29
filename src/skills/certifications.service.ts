import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, type StaffLocation, type StaffSkill } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';

@Injectable()
export class CertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async grantSkill(
    staffId: string,
    skillId: string,
    actor: AuthenticatedUser,
  ): Promise<StaffSkill> {
    await this.locationAccess.assertCanAccessStaff(actor, staffId);

    const staffSkill = await this.prisma.staffSkill.upsert({
      where: { staffId_skillId: { staffId, skillId } },
      create: { staffId, skillId },
      update: {},
    });

    await this.audit.record({
      entityType: AuditEntityType.STAFF_SKILL,
      entityId: staffSkill.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: staffSkill,
    });

    return staffSkill;
  }

  async revokeSkill(staffId: string, skillId: string, actor: AuthenticatedUser): Promise<void> {
    await this.locationAccess.assertCanAccessStaff(actor, staffId);
    const existing = await this.prisma.staffSkill.findUnique({
      where: { staffId_skillId: { staffId, skillId } },
    });
    if (!existing) return;

    await this.prisma.staffSkill.delete({ where: { id: existing.id } });
    await this.audit.record({
      entityType: AuditEntityType.STAFF_SKILL,
      entityId: existing.id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      beforeState: existing,
    });
  }

  listSkills(staffId: string) {
    return this.prisma.staffSkill.findMany({
      where: { staffId },
      include: { skill: true },
    });
  }

  async certifyLocation(
    staffId: string,
    locationId: string,
    actor: AuthenticatedUser,
  ): Promise<StaffLocation> {
    await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);

    const staffLocation = await this.prisma.staffLocation.upsert({
      where: { staffId_locationId: { staffId, locationId } },
      create: { staffId, locationId },
      update: { decertifiedAt: null, certifiedAt: new Date() },
    });

    await this.audit.record({
      entityType: AuditEntityType.STAFF_LOCATION,
      entityId: staffLocation.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: staffLocation,
      locationId,
    });

    return staffLocation;
  }

  /**
   * Soft-revoke: certification history (and every past shift/audit entry
   * tied to it) is preserved. Only future assignment eligibility is blocked
   * — see DECISIONS.md.
   */
  async decertifyLocation(
    staffId: string,
    locationId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);

    const existing = await this.prisma.staffLocation.findUnique({
      where: { staffId_locationId: { staffId, locationId } },
    });
    if (!existing || existing.decertifiedAt) return;

    const updated = await this.prisma.staffLocation.update({
      where: { id: existing.id },
      data: { decertifiedAt: new Date() },
    });

    await this.audit.record({
      entityType: AuditEntityType.STAFF_LOCATION,
      entityId: existing.id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      beforeState: existing,
      afterState: updated,
      locationId,
    });
  }

  listLocations(staffId: string) {
    return this.prisma.staffLocation.findMany({
      where: { staffId },
      include: { location: true },
    });
  }
}
