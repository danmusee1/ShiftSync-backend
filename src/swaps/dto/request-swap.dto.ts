import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RequestSwapDto {
  @ApiProperty({ description: 'The shift the requester currently holds and wants to give up' })
  @IsString()
  shiftId!: string;

  @ApiProperty({ description: 'The specific staff member invited to take it' })
  @IsString()
  targetStaffId!: string;

  @ApiPropertyOptional({
    description: 'If set, a true 1-for-1 exchange: the target shift the requester receives in return',
  })
  @IsOptional()
  @IsString()
  proposedReturnShiftId?: string;
}
