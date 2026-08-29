import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAvailabilityRuleDto } from './create-availability-rule.dto.js';

export class UpdateAvailabilityRuleDto extends PartialType(CreateAvailabilityRuleDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
