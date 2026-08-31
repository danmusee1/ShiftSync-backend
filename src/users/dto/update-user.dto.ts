import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, [
    'firstName',
    'lastName',
    'role',
    'homeTimezone',
    'notificationChannel',
    'desiredWeeklyHours',
    'hourlyRate',
  ] as const),
) {
  @ApiPropertyOptional({ description: 'Admin-initiated password reset' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
