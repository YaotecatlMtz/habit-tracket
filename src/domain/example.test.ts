import { describe, expect, it } from "vitest";

// Sample unit test. Delete it once you write your first real test (currentStreak).
function add(a: number, b: number) {
  return a + b;
}

describe("add", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
