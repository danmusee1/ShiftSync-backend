import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ description: 'IANA timezone, e.g. "America/Los_Angeles"' })
  @IsString()
  homeTimezone!: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  notificationChannel?: NotificationChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  desiredWeeklyHours?: number;
}
