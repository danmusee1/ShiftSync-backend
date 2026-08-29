import { Global, Module } from '@nestjs/common';
import { LocationAccessService } from './location-access.service.js';

@Global()
@Module({
  providers: [LocationAccessService],
  exports: [LocationAccessService],
})
export class AccessModule {}
