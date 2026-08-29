import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConstraintEngineModule } from '../scheduling/constraint-engine/constraint-engine.module.js';
import { SWAP_EXPIRY_QUEUE } from '../jobs/queue-names.js';
import { SwapExpiryProcessor } from './swap-expiry.processor.js';
import { SwapsController } from './swaps.controller.js';
import { SwapsService } from './swaps.service.js';

@Module({
  imports: [
    ConstraintEngineModule,
    NotificationsModule,
    BullModule.registerQueue({ name: SWAP_EXPIRY_QUEUE }),
  ],
  controllers: [SwapsController],
  providers: [SwapsService, SwapExpiryProcessor],
  exports: [SwapsService],
})
export class SwapsModule {}
