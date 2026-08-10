import { describe, expect, it } from "vitest";
import { datasetNeedsStatusRefresh, resolveRoute } from "./routes";

describe("resolveRoute", () => {
  it("maps hashes to data library routes", () => {
    expect(resolveRoute("")).toEqual({ name: "datasets" });
    expect(resolveRoute("#/datasets")).toEqual({ name: "datasets" });
    expect(resolveRoute("#/datasets/upload")).toEqual({ name: "dataset-upload" });
    expect(resolveRoute("#/datasets/dataset-1")).toEqual({ name: "dataset-detail", datasetId: "dataset-1" });
    expect(resolveRoute("#/map")).toEqual({ name: "map" });
    expect(resolveRoute("#/map?dataset=dataset-1")).toEqual({ name: "map", datasetId: "dataset-1" });
    expect(resolveRoute("#/map-demo")).toEqual({ name: "map-demo" });
    expect(resolveRoute("#/login")).toEqual({ name: "login" });
  });
});

describe("datasetNeedsStatusRefresh", () => {
  it("polls only datasets that are still waiting for worker inspection", () => {
    expect(datasetNeedsStatusRefresh({ status: "pending" })).toBe(true);
    expect(datasetNeedsStatusRefresh({ status: "processing" })).toBe(true);
    expect(datasetNeedsStatusRefresh({ status: "ready" })).toBe(false);
    expect(datasetNeedsStatusRefresh({ status: "failed" })).toBe(false);
    expect(datasetNeedsStatusRefresh(undefined)).toBe(false);
  });
});
