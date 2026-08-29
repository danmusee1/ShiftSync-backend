import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RequestDropDto {
  @ApiProperty()
  @IsString()
  shiftId!: string;
}
