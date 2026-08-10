import { describe, expect, it } from "vitest";

describe("web scaffold", () => {
  it("runs the frontend test harness", () => {
    expect("Research Asset Platform").toContain("Asset");
  });
});
