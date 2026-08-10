import { describe, expect, it } from "vitest";
import {
  buildInitialWorkbenchLayers,
  buildJingJinJiAdminBoundaryUrls,
  buildSupportedUploadAccept,
  buildDemoRegionDatasets,
  buildDefaultLayerConfig,
  buildLayerFromDataset,
  buildPreviewGeoJsonForDataset,
  buildGaodeVectorTileUrl,
  findAdminLeafAtLngLat,
  findParentAdminFeature,
  formatLayerMeta,
  getJingJinJiRegionCollection,
  getWorkbenchTabs,
  htmlDemoCurrentAdminStyle,
  htmlDemoParentAdminStyle,
  mergeLibraryDatasets,
  normalizeAdminBoundaryFeature,
  regionFeatureStyle,
  regionPropertiesFromFeature,
  upsertWorkbenchLayer,
} from "./MapWorkspacePage";

describe("map workspace helpers", () => {
  it("provides clickable Jing-Jin-Ji administrative region features", () => {
    const collection = getJingJinJiRegionCollection();

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features.length).toBeGreaterThanOrEqual(3);
    expect(collection.features.map((feature: { properties: { id: string } }) => feature.properties.id)).toContain(
      "110000",
    );
    expect(collection.features.map((feature: { properties: { name: string } }) => feature.properties.name)).toContain(
      "北京市",
    );
  });

  it("uses the same public administrative boundary sources as the original HTML demo", () => {
    const urls = buildJingJinJiAdminBoundaryUrls();

    expect(urls).toContain("https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=110000_full");
    expect(urls).toContain("https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=120000_full");
    expect(urls).toContain("https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=130100_full");
    expect(urls).toContain("https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=131100_full");
  });

  it("uses the exact Gaode vector basemap URL from the original HTML demo", () => {
    expect(buildGaodeVectorTileUrl()).toBe(
      "https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    );
  });

  it("normalizes DataV adcode properties into the app region id contract", () => {
    const feature = normalizeAdminBoundaryFeature({
      type: "Feature",
      properties: { adcode: 110101, name: "东城区" },
      geometry: { type: "MultiPolygon", coordinates: [] },
    });

    expect(feature.properties).toMatchObject({ id: "110101", name: "东城区", level: "admin" });
    expect(feature.geometry.type).toBe("MultiPolygon");
  });

  it("uses the original HTML demo highlight styles for identified administrative boundaries", () => {
    expect(htmlDemoParentAdminStyle()).toMatchObject({
      color: "#60a5fa",
      weight: 2,
      dashArray: "5, 10",
      fillColor: "#3b82f6",
      fillOpacity: 0.05,
      interactive: false,
    });
    expect(htmlDemoCurrentAdminStyle()).toMatchObject({
      color: "#fbbf24",
      weight: 3,
      fillColor: "#fbbf24",
      fillOpacity: 0.2,
      interactive: false,
    });
  });

  it("finds the clicked leaf administrative feature and its parent like the HTML demo", () => {
    const parent = normalizeAdminBoundaryFeature({
      type: "Feature",
      properties: { adcode: 110000, name: "北京市" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [115, 39],
            [117, 39],
            [117, 41],
            [115, 41],
            [115, 39],
          ],
        ],
      },
    });
    const leaf = normalizeAdminBoundaryFeature({
      type: "Feature",
      properties: { adcode: 110101, name: "东城区", parent: { adcode: 110000 } },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [116.3, 39.8],
            [116.5, 39.8],
            [116.5, 40],
            [116.3, 40],
            [116.3, 39.8],
          ],
        ],
      },
    });

    expect(findAdminLeafAtLngLat({ leafs: [leaf], parents: [parent] }, 116.4, 39.9)?.properties.name).toBe("东城区");
    expect(findParentAdminFeature({ leafs: [leaf], parents: [parent] }, leaf)?.properties.name).toBe("北京市");
  });

  it("extracts region id and display name from a feature", () => {
    const feature = getJingJinJiRegionCollection().features[0];

    expect(regionPropertiesFromFeature(feature)).toEqual({
      id: feature.properties.id,
      name: feature.properties.name,
    });
  });

  it("uses a stronger style for selected regions", () => {
    expect(regionFeatureStyle("110000", "110000").weight ?? 0).toBeGreaterThan(
      regionFeatureStyle("120000", "110000").weight ?? 0,
    );
    expect(regionFeatureStyle("110000", "110000").fillOpacity ?? 0).toBeGreaterThan(
      regionFeatureStyle("120000", "110000").fillOpacity ?? 0,
    );
  });

  it("builds demo fallback datasets when the API is unavailable", () => {
    const result = buildDemoRegionDatasets("110000", "北京市");

    expect(result.regionName).toBe("北京市");
    expect(result.datasets.length).toBeGreaterThan(0);
    expect(result.datasets[0].name).toContain("北京市");
  });

  it("starts with demo GIS layers that mirror the original workbench", () => {
    const layers = buildInitialWorkbenchLayers();

    expect(layers.map((layer) => layer.name)).toEqual(["京津冀行政区划", "城市韧性示例成果"]);
    expect(layers.every((layer) => layer.visible)).toBe(true);
  });

  it("formats layer type metadata for the layer control", () => {
    expect(formatLayerMeta({ id: "l1", name: "边界", type: "vector", visible: true })).toBe("Vector · l1");
    expect(formatLayerMeta({ id: "l2", name: "栅格", type: "raster", visible: false })).toBe("Raster · l2");
  });

  it("uses the original demo workbench tab order with symbology first", () => {
    expect(getWorkbenchTabs()).toEqual([
      { id: "sym", label: "符号" },
      { id: "layers", label: "图层" },
      { id: "data", label: "数据" },
      { id: "settings", label: "设置" },
    ]);
  });

  it("advertises all phase-one upload formats in the data panel", () => {
    expect(buildSupportedUploadAccept()).toBe(".zip,.tif,.tiff,.geojson,.json,.gpkg,.kml,.kmz,.csv");
  });

  it("builds demo-aligned default style configs for vector and raster layers", () => {
    expect(buildDefaultLayerConfig("vector")).toMatchObject({
      rampName: "Blues",
      classes: 5,
      opacity: 0.9,
      singleColor: "#2563eb",
      weight: 2.5,
    });
    expect(buildDefaultLayerConfig("raster")).toMatchObject({
      rampName: "Viridis",
      rasterMode: "classified",
      classify: "quantile",
      classes: 5,
    });
  });

  it("converts backend datasets into loadable workbench layer records", () => {
    expect(buildLayerFromDataset({ id: "ds-1", name: "人口栅格", type: "raster" })).toMatchObject({
      id: "ds-1",
      name: "人口栅格",
      type: "raster",
      visible: true,
      config: { rampName: "Viridis" },
    });

    expect(buildLayerFromDataset({ id: "ds-2", name: "道路网络", type: "table" })).toMatchObject({
      id: "ds-2",
      name: "道路网络",
      type: "vector",
      config: { rampName: "Blues" },
    });
  });

  it("adds newly loaded datasets to the top without duplicating existing layers", () => {
    const layers = buildInitialWorkbenchLayers();
    const loaded = buildLayerFromDataset({ id: "ds-1", name: "道路网络", type: "vector" });

    expect(upsertWorkbenchLayer(layers, loaded).map((layer) => layer.id)[0]).toBe("ds-1");
    expect(upsertWorkbenchLayer([loaded, ...layers], loaded).filter((layer) => layer.id === "ds-1")).toHaveLength(1);
  });

  it("reconciles refreshed backend datasets while preserving not-yet-returned local uploads", () => {
    const current = [
      { id: "roads", name: "道路", tags: ["old"], type: "vector", status: "pending" },
      { id: "local-only", name: "本地刚上传", tags: [], type: "vector", status: "pending" },
    ];
    const incoming = [{ id: "roads", name: "道路", tags: ["ready"], type: "vector", status: "ready" }];

    expect(mergeLibraryDatasets(current, incoming)).toEqual([
      { id: "roads", name: "道路", tags: ["ready"], type: "vector", status: "ready" },
      { id: "local-only", name: "本地刚上传", tags: [], type: "vector", status: "pending" },
    ]);
  });

  it("builds a visible fallback preview feature for datasets without generated previews yet", () => {
    const preview = buildPreviewGeoJsonForDataset({ id: "ds-1", name: "道路网络", type: "vector" });

    expect(preview.type).toBe("FeatureCollection");
    expect(preview.features[0].properties.dataset_id).toBe("ds-1");
    expect(preview.features[0].geometry.type).toBe("Point");
  });
});
