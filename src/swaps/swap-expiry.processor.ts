import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { EXPIRE_DROP_JOB, SWAP_EXPIRY_QUEUE } from '../jobs/queue-names.js';
import { SwapsService } from './swaps.service.js';

@Processor(SWAP_EXPIRY_QUEUE)
export class SwapExpiryProcessor extends WorkerHost {
  constructor(private readonly swapsService: SwapsService) {
    super();
  }

  async process(job: Job<{ swapRequestId: string }>): Promise<void> {
    if (job.name !== EXPIRE_DROP_JOB) return;
    await this.swapsService.expireDropIfStillPending(job.data.swapRequestId);
  }
}
