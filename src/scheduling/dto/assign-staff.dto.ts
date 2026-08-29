import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AssignStaffDto {
  @ApiProperty()
  @IsString()
  staffId!: string;
}
