import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DecisionDto } from './dto/decision.dto.js';
import { RequestDropDto } from './dto/request-drop.dto.js';
import { RequestSwapDto } from './dto/request-swap.dto.js';
import { SwapsService } from './swaps.service.js';

@ApiTags('swaps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SwapsController {
  constructor(private readonly swapsService: SwapsService) {}

  @Post('staff/:staffId/swap-requests')
  requestSwap(
    @Param('staffId') staffId: string,
    @Body() dto: RequestSwapDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.swapsService.requestSwap(staffId, dto, actor);
  }

  @Post('staff/:staffId/drop-requests')
  requestDrop(
    @Param('staffId') staffId: string,
    @Body() dto: RequestDropDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.swapsService.requestDrop(staffId, dto, actor);
  }

  @Get('staff/:staffId/swap-requests')
  listForStaff(@Param('staffId') staffId: string) {
    return this.swapsService.listForStaff(staffId);
  }

  @Get('swap-requests/open-drops')
  listOpenDrops(@CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.listOpenDrops(actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('swap-requests/pending-approval')
  listPendingForManager(@CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.listPendingForManager(actor);
  }

  @Get('swap-requests/:id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.findOne(id, actor);
  }

  @Post('swap-requests/:id/accept')
  accept(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.acceptSwap(id, actor);
  }

  @Post('swap-requests/:id/decline')
  decline(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.declineSwap(id, actor);
  }

  @Post('swap-requests/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.claimDrop(id, actor);
  }

  @Post('swap-requests/:id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.swapsService.cancel(id, actor, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('swap-requests/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.swapsService.managerApprove(id, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('swap-requests/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.swapsService.managerReject(id, dto, actor);
  }
}
