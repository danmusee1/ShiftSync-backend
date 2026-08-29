import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateShiftDto {
  @ApiProperty({ example: '2026-09-06T16:00:00.000Z', description: 'UTC instant' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-09-07T00:00:00.000Z', description: 'UTC instant (may be next calendar day for overnight shifts)' })
  @IsDateString()
  endAt!: string;

  @ApiProperty()
  @IsString()
  requiredSkillId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  headcountNeeded?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
