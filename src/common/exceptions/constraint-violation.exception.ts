import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConstraintViolation, StaffSuggestion } from '../constraints/constraint.types.js';

/**
 * Thrown whenever a scheduling action is blocked by a hard business-rule
 * violation (double-booking, min rest, skill/certification mismatch, etc).
 * Carries structured detail so the API response itself explains what broke
 * and, where possible, who could do it instead.
 */
export class ConstraintViolationException extends HttpException {
  constructor(violations: ConstraintViolation[], suggestions?: StaffSuggestion[]) {
    super(
      {
        error: 'ConstraintViolation',
        message: violations.map((v) => v.message).join('; '),
        violations,
        suggestions,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
