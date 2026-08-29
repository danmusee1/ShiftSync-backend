import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityExceptionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityExceptionDto {
  @ApiProperty({ example: '2026-09-05', description: 'Calendar date (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: AvailabilityExceptionType })
  @IsEnum(AvailabilityExceptionType)
  type!: AvailabilityExceptionType;

  @ApiPropertyOptional({ description: 'Omit for an entire-day exception' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
