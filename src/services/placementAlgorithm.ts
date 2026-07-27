import type { Elbow, PlacementPosition, PlacementStats } from "../types";

const ELBOW_TOLERANCE_M = 0.1; // 100mm, per catatan.md

export function calculatePlacements(
  totalLengthM: number,
  spacingMm: number,
  elbows: Elbow[],
): PlacementPosition[] {
  const spacingM = spacingMm / 1000;
  const sortedElbows = [...elbows].map((e) => e.position_m).sort((a, b) => a - b);

  const positions: PlacementPosition[] = [{ pos_m: 0, reason: "START" }];

  let currentPos = 0;
  let elbowIdx = 0;
  while (currentPos < totalLengthM) {
    const nextSpacingPos = currentPos + spacingM;
    const nextElbow = sortedElbows[elbowIdx];

    // An elbow always gets a hanger. It's placed as soon as it's within reach
    // of the next spacing tick (i.e. the spacing tick would otherwise land
    // past it, within tolerance) — this forces a hanger at every elbow while
    // avoiding a redundant near-duplicate hanger from the spacing schedule.
    if (
      nextElbow !== undefined &&
      nextElbow > currentPos &&
      nextElbow <= nextSpacingPos + ELBOW_TOLERANCE_M &&
      nextElbow < totalLengthM
    ) {
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

  positions.push({ pos_m: round(totalLengthM), reason: "END" });

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
