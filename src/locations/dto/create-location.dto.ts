import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'IANA timezone, e.g. "America/New_York"' })
  @IsString()
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
