import { PartialType } from '@nestjs/swagger';
import { CreateShiftDto } from './create-shift.dto.js';

export class UpdateShiftDto extends PartialType(CreateShiftDto) {}
