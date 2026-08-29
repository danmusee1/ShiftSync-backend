import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateScheduleWeekDto {
  @ApiProperty({ example: '2026-09-06', description: 'Must be a Sunday' })
  @IsDateString()
  weekStartDate!: string;

  @ApiPropertyOptional({ default: 48 })
  @IsOptional()
  @IsInt()
  @Min(0)
  publishCutoffHours?: number;
}
