import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DecisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
