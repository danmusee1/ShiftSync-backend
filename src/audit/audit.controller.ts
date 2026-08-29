import { Controller, Get, Header, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntityType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AuditService } from './audit.service.js';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('entities/:entityType/:entityId')
  findForEntity(
    @Param('entityType') entityType: AuditEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.findForEntity(entityType, entityId);
  }

  @Roles(Role.ADMIN)
  @Get('export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="audit-log.xlsx"')
  async export(
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.auditService.exportToXlsx({
      locationId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return new StreamableFile(buffer);
  }
}
