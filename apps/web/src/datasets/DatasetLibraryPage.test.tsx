import { describe, expect, it } from "vitest";
import { datasetStatusLabel, emptyDatasetMessage, filterDatasets } from "./DatasetLibraryPage";

describe("filterDatasets", () => {
  const datasets = [
    { id: "1", name: "道路韧性", tags: ["交通"], type: "vector", project: "京津冀" },
    { id: "2", name: "人口栅格", tags: ["人口"], type: "raster", project: "城市韧性" },
    { id: "3", name: "生态空间", tags: ["生态"], type: "vector", project: "绿色发展" },
  ];

  it("matches by name", () => {
    expect(filterDatasets(datasets, "道路").map((d) => d.id)).toEqual(["1"]);
  });

  it("matches by tag", () => {
    expect(filterDatasets(datasets, "人口").map((d) => d.id)).toEqual(["2"]);
  });

  it("matches by project and type", () => {
    expect(filterDatasets(datasets, "绿色").map((d) => d.id)).toEqual(["3"]);
    expect(filterDatasets(datasets, "raster").map((d) => d.id)).toEqual(["2"]);
  });
});

describe("dataset library state labels", () => {
  it("describes processing, failed, and spatial-reference states clearly", () => {
    expect(datasetStatusLabel("pending")).toBe("待处理");
    expect(datasetStatusLabel("processing")).toBe("后台识别中");
    expect(datasetStatusLabel("failed")).toBe("处理失败");
    expect(datasetStatusLabel("needs_spatial_reference")).toBe("待补充坐标系");
    expect(datasetStatusLabel("ready")).toBe("可预览下载");
  });

  it("uses different empty messages for no data and filtered results", () => {
    expect(emptyDatasetMessage("")).toBe("暂无已入库 GIS 数据");
    expect(emptyDatasetMessage("交通")).toBe("没有匹配“交通”的数据集");
  });
});
