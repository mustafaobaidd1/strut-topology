/**
 * Warns before (or while) a mesh is too heavy for the device. The cost of one optimisation
 * iteration grows roughly linearly with the element count for multigrid-preconditioned CG
 * (plus a mild growth in CG iterations), so the time measured on the current mesh predicts the
 * next one.
 */

/** Iterations slower than this make the live view feel sluggish. */
export const SLOW_ITERATION_MS = 450;

export function predictIterationMs(
  msNow: number,
  elementsNow: number,
  elementsNext: number,
): number {
  if (!(msNow > 0) || !(elementsNow > 0)) return NaN;
  const ratio = elementsNext / elementsNow;
  return msNow * ratio * Math.max(1, Math.pow(ratio, 0.1));
}

/** A warning sentence, or null when the mesh should be comfortable. */
export function meshWarning(
  msNow: number,
  elementsNow: number,
  elementsNext: number,
  cores: number,
): string | null {
  const predicted = predictIterationMs(msNow, elementsNow, elementsNext);
  if (Number.isFinite(predicted)) {
    if (predicted > SLOW_ITERATION_MS) {
      return `This mesh is heavy for this device: about ${(predicted / 1000).toFixed(1)} s per iteration.`;
    }
    return null;
  }
  // No measurement yet: fall back on the core count.
  if (elementsNext > 20000 && cores <= 4) {
    return 'This mesh may be too fine for this device; iterations could take seconds.';
  }
  return null;
}
