import { describe, expect, it } from "vitest";
import { evenCutTimes, recommendedShots, replanShots, suggestedShotCount } from "./plan";
import { formatTimestamp } from "./render";
import { makeShots } from "./testFixtures";

describe("recommendedShots (§12.3)", () => {
  it("tracks the guide's anchors", () => {
    expect(recommendedShots(5)).toEqual({ min: 1, max: 2 });
    expect(recommendedShots(10).min).toBe(2);
    expect(recommendedShots(15)).toEqual({ min: 3, max: 5 });
  });

  it("never suggests zero shots", () => {
    expect(recommendedShots(1).min).toBeGreaterThanOrEqual(1);
    expect(suggestedShotCount(1)).toBeGreaterThanOrEqual(1);
  });
});

describe("evenCutTimes", () => {
  it("leaves Shot 1 without a timestamp (§12.1)", () => {
    expect(evenCutTimes(12, 3)[0]).toBeNull();
  });

  it("spaces the cuts evenly and keeps them inside the duration", () => {
    const cuts = evenCutTimes(12, 3);
    expect(cuts.map((c) => (c === null ? null : formatTimestamp(c)))).toEqual([
      null,
      "00:04.000",
      "00:08.000",
    ]);
    for (const cut of cuts.slice(1)) expect(cut!).toBeLessThan(12000);
  });

  it("produces strictly increasing times", () => {
    const cuts = evenCutTimes(9, 4).slice(1) as number[];
    for (let i = 1; i < cuts.length; i += 1) {
      expect(cuts[i]!).toBeGreaterThan(cuts[i - 1]!);
    }
  });
});

describe("replanShots", () => {
  let counter = 0;
  const newId = () => `new-${(counter += 1)}`;

  it("reuses existing shot ids so dialogue keeps pointing somewhere real", () => {
    const existing = makeShots(2);
    const { shots, removedIds } = replanShots(existing, 12, 3, newId);

    expect(shots).toHaveLength(3);
    expect(shots[0]!.id).toBe(existing[0]!.id);
    expect(shots[1]!.id).toBe(existing[1]!.id);
    expect(removedIds).toEqual([]);
  });

  it("reports the shots it dropped and where their content should go", () => {
    const existing = makeShots(4);
    const { shots, removedIds, fallbackId } = replanShots(existing, 6, 2, newId);

    expect(shots).toHaveLength(2);
    expect(removedIds).toEqual([existing[2]!.id, existing[3]!.id]);
    expect(fallbackId).toBe(shots[1]!.id);
  });

  it("keeps the beats the user already wrote", () => {
    const existing = makeShots(2);
    existing[0]!.beat = "entra al local";
    const { shots } = replanShots(existing, 10, 3, newId);
    expect(shots[0]!.beat).toBe("entra al local");
  });
});
