import { expect, it } from "vitest";
import { ROOMS } from "../shared/rooms.ts";
import { POSE_LIMIT } from "../server/low-trust.ts";

it("the pose clamp covers every real Room but is not wildly larger", () => {
  const biggest = Math.max(...ROOMS.flatMap((r) => [r.width, r.depth, r.wallHeight]));
  expect(POSE_LIMIT).toBeGreaterThanOrEqual(biggest);
  expect(POSE_LIMIT).toBeLessThanOrEqual(biggest * 4);
});
