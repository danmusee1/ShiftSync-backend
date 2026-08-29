import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({ example: 'bartender' })
  @IsString()
  @MinLength(2)
  name!: string;
}
