import { describe, expect, it } from "vitest";
import {
  MAX_LENGTH_M,
  MIN_CLEARANCE_M,
  MIN_SPACING_MM,
  calculatePlacements,
  summarizePlacements,
} from "./placementAlgorithm";

describe("calculatePlacements", () => {
  it("brackets the tray with a START and an END hanger", () => {
    const positions = calculatePlacements(10, 1500);

    expect(positions[0]).toEqual({ pos_m: 0, reason: "START" });
    expect(positions.at(-1)).toEqual({ pos_m: 10, reason: "END" });
  });

  it("fills the run on the spacing schedule", () => {
    expect(calculatePlacements(6, 1500)).toEqual([
      { pos_m: 0, reason: "START" },
      { pos_m: 1.5, reason: "SPACING" },
      { pos_m: 3, reason: "SPACING" },
      { pos_m: 4.5, reason: "SPACING" },
      { pos_m: 6, reason: "END" },
    ]);
  });

  // The spacing entered on the web page is the whole rule. A bend used to force
  // a hanger of its own, which is what put two of them inside each other at
  // every joint.
  it("answers only to the spacing, whatever the run does in between", () => {
    const positions = calculatePlacements(9, 3000);

    expect(positions.map((p) => p.pos_m)).toEqual([0, 3, 6, 9]);
    expect(positions.some((p) => p.reason === "ELBOW")).toBe(false);
  });

  it("holds the spacing exactly over a long run", () => {
    const positions = calculatePlacements(150, 1500);

    // Counted from the start, not accumulated: 100 additions of 1.5 drift.
    expect(positions).toHaveLength(101);
    expect(positions.at(-2)).toEqual({ pos_m: 148.5, reason: "SPACING" });
  });

  it("always returns strictly increasing positions", () => {
    const positions = calculatePlacements(45.5, 1500);

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
        expect(() => calculatePlacements(10, spacing)).toThrow(RangeError);
      },
    );

    it.each([0, -5, Number.NaN, MAX_LENGTH_M + 1])("throws on totalLengthM=%p", (length) => {
      expect(() => calculatePlacements(length, 1500)).toThrow(RangeError);
    });
  });

  describe("tray end", () => {
    it("merges a tick that lands just short of the end into the END hanger", () => {
      const positions = calculatePlacements(3.1, 1500);

      // 3.0 is 100mm short of the end; two hangers do not fit in 100mm.
      expect(positions.at(-1)).toEqual({ pos_m: 3.1, reason: "END" });
      expect(positions.filter((p) => p.pos_m > 2.9)).toHaveLength(1);
    });

    it("keeps a tick that clears the end by the clearance", () => {
      const positions = calculatePlacements(3 + MIN_CLEARANCE_M, 1500);

      expect(positions.at(-2)).toEqual({ pos_m: 3, reason: "SPACING" });
      expect(positions.at(-1)).toEqual({ pos_m: 3.3, reason: "END" });
    });

    it("does not collapse START into END on a very short tray", () => {
      const positions = calculatePlacements(0.05, 1500);

      expect(positions).toEqual([
        { pos_m: 0, reason: "START" },
        { pos_m: 0.05, reason: "END" },
      ]);
    });

    it("does not duplicate a spacing tick that lands on the tray end", () => {
      const positions = calculatePlacements(3, 1500);

      expect(positions.at(-1)).toEqual({ pos_m: 3, reason: "END" });
      expect(positions.filter((p) => p.pos_m === 3)).toHaveLength(1);
    });

    it("holds the clearance between every pair of hangers", () => {
      const positions = calculatePlacements(45.4, 1500);

      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].pos_m - positions[i - 1].pos_m).toBeGreaterThanOrEqual(
          MIN_CLEARANCE_M,
        );
      }
    });
  });
});

describe("summarizePlacements", () => {
  it("counts each placement reason", () => {
    const stats = summarizePlacements(calculatePlacements(10, 1500));

    expect(stats.total).toBe(stats.atSpacing + stats.startEnd);
    expect(stats.startEnd).toBe(2);
  });

  it("reports zeroes for an empty placement list", () => {
    expect(summarizePlacements([])).toEqual({
      total: 0,
      atSpacing: 0,
      startEnd: 0,
    });
  });
});
