import { describe, expect, it } from "vitest";
import { buildDatasetMapHref, datasetMapCtaLabel, datasetSupportsMapPreview } from "./DatasetDetailPage";

describe("dataset detail map preview helpers", () => {
  it("opens ready vector and raster datasets from the map workspace route", () => {
    expect(datasetSupportsMapPreview({ type: "vector", status: "ready" })).toBe(true);
    expect(datasetSupportsMapPreview({ type: "raster", status: "ready" })).toBe(true);
    expect(buildDatasetMapHref("roads")).toBe("#/map?dataset=roads");
  });

  it("keeps non-ready datasets in a processing guidance state", () => {
    expect(datasetSupportsMapPreview({ type: "vector", status: "processing" })).toBe(false);
    expect(datasetMapCtaLabel("processing")).toBe("后台识别完成后可加载到地图");
    expect(datasetMapCtaLabel("ready")).toBe("在地图工作台打开预览");
  });
});
