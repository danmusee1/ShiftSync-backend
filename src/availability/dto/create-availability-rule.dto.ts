import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday .. 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime!: string;
}
