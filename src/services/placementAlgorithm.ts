import type { Elbow, PlacementPosition, PlacementStats } from "../types";

/**
 * A hanger within this distance of another required position is considered to
 * serve it, so we never schedule two hangers a few centimetres apart.
 */
const ELBOW_TOLERANCE_M = 0.1; // 100mm

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
    // Drop elbows the cursor has already passed. Without this a duplicate or
    // already-served elbow never advances elbowIdx, and every elbow behind it
    // is silently skipped.
    while (elbowIdx < sortedElbows.length && sortedElbows[elbowIdx] <= currentPos) {
      elbowIdx++;
    }

    const nextSpacingPos = currentPos + spacingM;
    const nextElbow = sortedElbows[elbowIdx];

    // An elbow always gets a hanger. It's placed as soon as it's within reach
    // of the next spacing tick (i.e. the spacing tick would otherwise land
    // past it, within tolerance) — this forces a hanger at every elbow while
    // avoiding a redundant near-duplicate hanger from the spacing schedule.
    if (nextElbow !== undefined && nextElbow <= nextSpacingPos + ELBOW_TOLERANCE_M) {
      positions.push({ pos_m: round(nextElbow), reason: "ELBOW" });
      currentPos = nextElbow;
      elbowIdx++;
    } else if (nextSpacingPos >= totalLengthM) {
      break;
    } else {
      positions.push({ pos_m: round(nextSpacingPos), reason: "SPACING" });
      currentPos = nextSpacingPos;
    }
  }

  // The last hanger can land within tolerance of the tray end. Snap it to the
  // end instead of adding a second hanger a few centimetres further along —
  // two hangers don't fit in 100mm.
  const last = positions[positions.length - 1];
  if (positions.length > 1 && totalLengthM - last.pos_m <= ELBOW_TOLERANCE_M) {
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
