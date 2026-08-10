import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDataset,
  getDatasetDownload,
  getDatasetPreview,
  getRegionDatasets,
  listDatasets,
  login,
  uploadDataset,
} from "./client";

describe("dataset api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists datasets with authenticated filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "1", name: "道路韧性", tags: ["交通"], type: "vector" }]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const datasets = await listDatasets("token-1", { q: "交通", status: "ready" });

    expect(datasets).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/datasets?q=%E4%BA%A4%E9%80%9A&status=ready",
      { headers: { Authorization: "Bearer token-1" } },
    );
  });

  it("uploads dataset metadata and file through multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "1", name: "道路韧性", tags: ["交通"], type: "unknown" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["zip-bytes"], "roads.zip", { type: "application/zip" });
    await uploadDataset(
      "token-1",
      { name: "道路韧性", project: "京津冀", tags: ["交通", "韧性"], description: "ArcGIS 导出" },
      file,
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/datasets");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
    expect(init.method).toBe("POST");
    expect(init.body.get("name")).toBe("道路韧性");
    expect(init.body.get("project")).toBe("京津冀");
    expect(init.body.get("tags")).toBe("交通,韧性");
    expect(init.body.get("description")).toBe("ArcGIS 导出");
    expect(init.body.get("file")).toBe(file);
  });

  it("requests an original-file download URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ download_url: "https://storage.local/file.zip", expires_in: 900 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDatasetDownload("token-1", "dataset-1");

    expect(result.download_url).toBe("https://storage.local/file.zip");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/datasets/dataset-1/download", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("logs in with email and password", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "token-1", token_type: "bearer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await login("member@example.com", "correct-password");

    expect(result.access_token).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@example.com", password: "correct-password" }),
    });
  });

  it("fetches a dataset detail by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "dataset-1", name: "道路韧性", tags: ["交通"], type: "vector" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const dataset = await getDataset("token-1", "dataset-1");

    expect(dataset.name).toBe("道路韧性");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/datasets/dataset-1", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("fetches a dataset map preview by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "dataset-1",
          name: "道路韧性",
          type: "vector",
          status: "ready",
          preview_kind: "geojson",
          geojson: { type: "FeatureCollection", features: [] },
          preview_url: null,
          message: null,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const preview = await getDatasetPreview("token-1", "dataset-1");

    expect(preview.preview_kind).toBe("geojson");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/datasets/dataset-1/preview", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("fetches datasets intersecting an administrative region", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          region: { id: "110108", name: "海淀区" },
          datasets: [{ id: "dataset-1", name: "道路韧性", tags: ["交通"], type: "vector" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRegionDatasets("token-1", "110108");

    expect(result.region.name).toBe("海淀区");
    expect(result.datasets[0].id).toBe("dataset-1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/admin-regions/110108/datasets", {
      headers: { Authorization: "Bearer token-1" },
    });
  });
});
