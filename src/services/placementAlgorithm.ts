// Explicit .js extension: api/hanger-config.ts imports this module, so it is
// compiled and run as Node ESM on Vercel, where extensionless relative
// specifiers do not resolve. Vite resolves the .js back to this .ts file.
import type { Elbow, PlacementPosition, PlacementStats } from "../types/index.js";

/**
 * The closest two hangers may stand, in metres.
 *
 * An elbow is scanned at the joint it sits on, and that joint is where the tray
 * it was matched to begins or ends — so an elbow's position is nearly always a
 * few centimetres from 0 or from the tray length. Schedule it as its own hanger
 * and it lands inside the START or END hanger bracketing that tray: on the plan
 * one symbol, in the model two hangers occupying the same space.
 *
 * A required position closer than this to one already scheduled is therefore
 * treated as served by it. The elbow still gets its hanger — it is the hanger
 * already standing there.
 */
export const MIN_CLEARANCE_M = 0.3; // 300mm

/** Guard rails so a bad payload can't spin the placement loop forever. */
export const MIN_SPACING_MM = 100;
export const MAX_LENGTH_M = 10_000;

export function calculatePlacements(
  totalLengthM: number,
  spacingMm: number,
  elbows: Elbow[],
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

  // Elbows outside the tray are already served by the START/END hangers, and a
  // non-finite position would stall the cursor below.
  const sortedElbows = elbows
    .map((e) => e.position_m)
    .filter((pos) => Number.isFinite(pos) && pos > 0 && pos < totalLengthM)
    .sort((a, b) => a - b);

  const positions: PlacementPosition[] = [{ pos_m: 0, reason: "START" }];

  let currentPos = 0;
  let elbowIdx = 0;

  while (currentPos < totalLengthM) {
    // Drop elbows the hanger at the cursor already serves — those behind it,
    // and those too close in front of it to stand beside it. Without this a
    // duplicate or already-served elbow never advances elbowIdx, and every
    // elbow behind it is silently skipped.
    while (elbowIdx < sortedElbows.length && tooClose(currentPos, sortedElbows[elbowIdx])) {
      elbowIdx++;
    }

    const nextSpacingPos = currentPos + spacingM;
    const nextElbow = sortedElbows[elbowIdx];

    // An elbow always gets a hanger. It's placed as soon as it's within reach
    // of the next spacing tick (i.e. the spacing tick would otherwise land
    // past it, or close enough in front of it to collide) — this forces a
    // hanger at every elbow while avoiding a redundant near-duplicate hanger
    // from the spacing schedule.
    if (
      nextElbow !== undefined &&
      (nextElbow <= nextSpacingPos || tooClose(nextSpacingPos, nextElbow))
    ) {
      positions.push({ pos_m: round(nextElbow), reason: "ELBOW" });
      // The rounded value, so the clearance is measured between the positions
      // actually emitted rather than the raw one the scan reported.
      currentPos = round(nextElbow);
      elbowIdx++;
    } else if (nextSpacingPos >= totalLengthM) {
      break;
    } else {
      positions.push({ pos_m: round(nextSpacingPos), reason: "SPACING" });
      currentPos = nextSpacingPos;
    }
  }

  // The last hanger can land short of the tray end by less than the clearance.
  // Snap it to the end instead of adding a second hanger a few centimetres
  // further along — two hangers don't fit in 300mm.
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
    atElbows: positions.filter((p) => p.reason === "ELBOW").length,
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
