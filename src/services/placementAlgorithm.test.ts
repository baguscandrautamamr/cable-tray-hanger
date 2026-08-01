import { describe, expect, it } from "vitest";
import type { Elbow } from "../types";
import {
  MAX_LENGTH_M,
  MIN_SPACING_MM,
  calculatePlacements,
  summarizePlacements,
} from "./placementAlgorithm";

const elbowsAt = (...positions: number[]): Elbow[] =>
  positions.map((position_m) => ({ position_m }));

describe("calculatePlacements", () => {
  it("brackets the tray with a START and an END hanger", () => {
    const positions = calculatePlacements(10, 1500, []);

    expect(positions[0]).toEqual({ pos_m: 0, reason: "START" });
    expect(positions.at(-1)).toEqual({ pos_m: 10, reason: "END" });
  });

  it("fills the run on the spacing schedule when there are no elbows", () => {
    expect(calculatePlacements(6, 1500, [])).toEqual([
      { pos_m: 0, reason: "START" },
      { pos_m: 1.5, reason: "SPACING" },
      { pos_m: 3, reason: "SPACING" },
      { pos_m: 4.5, reason: "SPACING" },
      { pos_m: 6, reason: "END" },
    ]);
  });

  it("forces a hanger at every elbow and resumes spacing from it", () => {
    const positions = calculatePlacements(10, 1500, elbowsAt(1.48, 4.2));

    expect(positions).toContainEqual({ pos_m: 1.48, reason: "ELBOW" });
    expect(positions).toContainEqual({ pos_m: 4.2, reason: "ELBOW" });
    // Spacing restarts from the elbow, not from the missed tick.
    expect(positions).toContainEqual({ pos_m: 2.98, reason: "SPACING" });
  });

  it("always returns strictly increasing positions", () => {
    const positions = calculatePlacements(45.5, 1500, elbowsAt(1.48, 4.2, 12.8, 22.3, 35.6));

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].pos_m).toBeGreaterThan(positions[i - 1].pos_m);
    }
  });

  describe("invalid input is rejected instead of looping forever", () => {
    // Regression: spacing <= 0 left currentPos unchanged (or moving backwards),
    // so the loop never terminated and froze the browser tab / serverless call.
    it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY, MIN_SPACING_MM - 1])(
      "throws on spacingMm=%p",
      (spacing) => {
        expect(() => calculatePlacements(10, spacing, [])).toThrow(RangeError);
      },
    );

    it.each([0, -5, Number.NaN, MAX_LENGTH_M + 1])("throws on totalLengthM=%p", (length) => {
      expect(() => calculatePlacements(length, 1500, [])).toThrow(RangeError);
    });
  });

  describe("elbow queue cannot stall", () => {
    // Regression: an elbow at or behind the cursor never advanced elbowIdx, so
    // every elbow after it was silently dropped and Revit lost those hangers.
    it("still places later elbows when one sits at position 0", () => {
      const positions = calculatePlacements(10, 1500, elbowsAt(0, 3, 7));

      expect(positions).toContainEqual({ pos_m: 3, reason: "ELBOW" });
      expect(positions).toContainEqual({ pos_m: 7, reason: "ELBOW" });
    });

    it("still places later elbows when one is duplicated", () => {
      const positions = calculatePlacements(10, 1500, elbowsAt(3, 3, 7));

      expect(summarizePlacements(positions).atElbows).toBe(2);
      expect(positions).toContainEqual({ pos_m: 7, reason: "ELBOW" });
    });

    it("still places later elbows when one is behind the tray start", () => {
      const positions = calculatePlacements(10, 1500, elbowsAt(-1, 7));

      expect(positions).toContainEqual({ pos_m: 7, reason: "ELBOW" });
    });

    it("ignores elbows past the tray end and non-finite positions", () => {
      const positions = calculatePlacements(10, 1500, elbowsAt(99, Number.NaN, 3));

      expect(summarizePlacements(positions).atElbows).toBe(1);
      expect(positions).toContainEqual({ pos_m: 3, reason: "ELBOW" });
    });

    it("accepts elbows in any order", () => {
      expect(calculatePlacements(10, 1500, elbowsAt(7, 3))).toEqual(
        calculatePlacements(10, 1500, elbowsAt(3, 7)),
      );
    });
  });

  describe("tray end", () => {
    // Regression: an elbow just short of the end produced two hangers 50mm apart.
    it("merges a near-end elbow into the END hanger", () => {
      const positions = calculatePlacements(45.5, 1500, elbowsAt(45.45));

      expect(positions.at(-1)).toEqual({ pos_m: 45.5, reason: "END" });
      expect(positions.filter((p) => p.pos_m > 45.3)).toHaveLength(1);
    });

    it("keeps an elbow that clears the tolerance as its own hanger", () => {
      const positions = calculatePlacements(45.5, 1500, elbowsAt(45.2));

      expect(positions.at(-2)).toEqual({ pos_m: 45.2, reason: "ELBOW" });
      expect(positions.at(-1)).toEqual({ pos_m: 45.5, reason: "END" });
    });

    it("does not collapse START into END on a very short tray", () => {
      const positions = calculatePlacements(0.05, 1500, []);

      expect(positions).toEqual([
        { pos_m: 0, reason: "START" },
        { pos_m: 0.05, reason: "END" },
      ]);
    });

    it("does not duplicate a spacing tick that lands on the tray end", () => {
      const positions = calculatePlacements(3, 1500, []);

      expect(positions.at(-1)).toEqual({ pos_m: 3, reason: "END" });
      expect(positions.filter((p) => p.pos_m === 3)).toHaveLength(1);
    });
  });
});

describe("summarizePlacements", () => {
  it("counts each placement reason", () => {
    const stats = summarizePlacements(calculatePlacements(10, 1500, elbowsAt(3)));

    expect(stats.total).toBe(stats.atElbows + stats.atSpacing + stats.startEnd);
    expect(stats.atElbows).toBe(1);
    expect(stats.startEnd).toBe(2);
  });

  it("reports zeroes for an empty placement list", () => {
    expect(summarizePlacements([])).toEqual({
      total: 0,
      atElbows: 0,
      atSpacing: 0,
      startEnd: 0,
    });
  });
});
