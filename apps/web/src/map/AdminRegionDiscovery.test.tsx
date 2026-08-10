import { describe, expect, it } from "vitest";
import { loadRegionDatasets, normalizeRegionResult, summarizeRegionDatasets } from "./AdminRegionDiscovery";

describe("summarizeRegionDatasets", () => {
  it("formats empty and non-empty results", () => {
    expect(summarizeRegionDatasets("海淀区", [])).toBe("海淀区暂无已入库数据");
    expect(summarizeRegionDatasets("海淀区", [{ id: "1", name: "道路韧性" }])).toBe(
      "海淀区已有 1 个数据成果",
    );
  });

  it("normalizes backend region discovery results for display", () => {
    const result = normalizeRegionResult({
      region: { id: "110108", name: "海淀区" },
      datasets: [{ id: "1", name: "道路韧性", type: "vector", tags: ["交通"] }],
    });

    expect(result.regionName).toBe("海淀区");
    expect(result.datasets).toEqual([{ id: "1", name: "道路韧性" }]);
  });

  it("loads datasets for a selected administrative region id", async () => {
    const fetcher = async (token: string, regionId: string) => {
      expect(token).toBe("token-1");
      expect(regionId).toBe("110108");
      return {
        region: { id: regionId, name: "海淀区" },
        datasets: [{ id: "1", name: "道路韧性", type: "vector", tags: ["交通"] }],
      };
    };

    const result = await loadRegionDatasets("token-1", "110108", fetcher);

    expect(result.regionName).toBe("海淀区");
    expect(result.datasets).toEqual([{ id: "1", name: "道路韧性" }]);
  });
});
