import { ConflictException } from '@nestjs/common';

/**
 * Once a week is published, shifts within it may only be edited/unpublished
 * up until `publishCutoffHours` before the earliest affected shift starts.
 * Last-minute coverage changes past that point go through the swap/drop
 * workflow instead — see DECISIONS.md.
 */
export function assertEditableOrThrow(params: {
  isPublished: boolean;
  publishCutoffHours: number;
  earliestAffectedStart: Date;
}): void {
  if (!params.isPublished) return;

  const cutoff = new Date(
    params.earliestAffectedStart.getTime() - params.publishCutoffHours * 3_600_000,
  );

  if (new Date() >= cutoff) {
    throw new ConflictException(
      `This schedule can no longer be edited: the ${params.publishCutoffHours}h cutoff before ` +
        `${params.earliestAffectedStart.toISOString()} has passed. Use the swap/drop workflow for coverage changes.`,
    );
  }
}
