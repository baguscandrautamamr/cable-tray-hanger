// Explicit .js extension: api/hanger-config.ts imports this module, so it is
// compiled and run as Node ESM on Vercel, where extensionless relative
// specifiers do not resolve. Vite resolves the .js back to this .ts file.
import type { PlacementPosition, PlacementStats } from "../types/index.js";

/**
 * The closest two hangers may stand, in metres.
 *
 * Only the tray end needs it now: the last spacing tick can land a few
 * centimetres short of the END hanger, and two hangers do not fit in 300mm.
 * Hangers that meet across a joint are separated by the add-in, which is the
 * only side that knows two trays touch.
 */
export const MIN_CLEARANCE_M = 0.3; // 300mm

/** Guard rails so a bad payload can't spin the placement loop forever. */
export const MIN_SPACING_MM = 100;
export const MAX_LENGTH_M = 10_000;

/**
 * Where the hangers go on one tray: the two ends, and the spacing in between.
 *
 * Nothing else earns a hanger. An elbow used to force one, which put a hanger a
 * few centimetres from the tray end it was scanned at — the spacing asked for
 * on the web page is the whole rule, and a run with six bends now carries the
 * same number of hangers as a straight one of the same length.
 */
export function calculatePlacements(
  totalLengthM: number,
  spacingMm: number,
): PlacementPosition[] {
  if (!Number.isFinite(totalLengthM) || totalLengthM <= 0 || totalLengthM > MAX_LENGTH_M) {
    throw new RangeError(
      `totalLengthM must be greater than 0 and at most ${MAX_LENGTH_M}, got ${totalLengthM}`,
    );
  }
  if (!Number.isFinite(spacingMm) || spacingMm < MIN_SPACING_MM) {
    throw new RangeError(`spacingMm must be at least ${MIN_SPACING_MM}, got ${spacingMm}`);
  }

  const spacingM = spacingMm / 1000;
  const positions: PlacementPosition[] = [{ pos_m: 0, reason: "START" }];

  // Counted from the start rather than accumulated, so the hundredth hanger
  // sits at a hundred spacings and not at a hundred roundings of one.
  for (let tick = 1; tick * spacingM < totalLengthM; tick++) {
    positions.push({ pos_m: round(tick * spacingM), reason: "SPACING" });
  }

  // The last tick can land short of the tray end by less than the clearance.
  // Snap it to the end instead of adding a second hanger a few centimetres
  // further along.
  const last = positions[positions.length - 1];
  if (positions.length > 1 && tooClose(last.pos_m, totalLengthM)) {
    positions[positions.length - 1] = { pos_m: round(totalLengthM), reason: "END" };
  } else {
    positions.push({ pos_m: round(totalLengthM), reason: "END" });
  }

  return positions;
}

export function summarizePlacements(positions: PlacementPosition[]): PlacementStats {
  return {
    total: positions.length,
    atSpacing: positions.filter((p) => p.reason === "SPACING").length,
    startEnd: positions.filter((p) => p.reason === "START" || p.reason === "END").length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * True when `later` is behind `earlier` or too close in front of it to take a
 * hanger of its own.
 *
 * The gap is rounded to the centimetre the positions are emitted in before
 * being compared, because the subtraction is not exact: 45.5 - 45.2 is
 * 0.29999999999999716, and without the rounding a hanger sitting at exactly the
 * clearance reads as too close and gets merged away.
 */
function tooClose(earlier: number, later: number): boolean {
  return round(later - earlier) < MIN_CLEARANCE_M;
}
