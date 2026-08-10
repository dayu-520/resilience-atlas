import { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, LayerGroup, Map as LeafletMap, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  getDatasetDownload,
  getDatasetPreview,
  listDatasets,
  uploadDataset,
  type DatasetSummary,
  type DatasetUploadMetadata,
  type GeoJsonFeatureCollection,
} from "../api/client";
import { AdminRegionDiscovery, loadRegionDatasets } from "./AdminRegionDiscovery";

type RegionDataset = { id: string; name: string };

type RegionState = {
  regionName: string;
  datasets: RegionDataset[];
};

type RegionProperties = {
  id: string;
  name: string;
  level: string;
  adcode?: number | string;
  parent?: { adcode?: number | string };
  [key: string]: unknown;
};

type PolygonGeometry = {
  type: "Polygon";
  coordinates: number[][][];
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

type RegionFeature = {
  type: "Feature";
  properties: RegionProperties;
  geometry: PolygonGeometry | MultiPolygonGeometry;
};

type RegionCollection = {
  type: "FeatureCollection";
  features: RegionFeature[];
};

type AdminBoundaryCache = {
  leafs: RegionFeature[];
  parents: RegionFeature[];
};

type WorkbenchLayer = {
  id: string;
  name: string;
  type: "vector" | "raster";
  visible: boolean;
  config: WorkbenchLayerConfig;
  previewGeoJson?: GeoJsonFeatureCollection | null;
  previewMessage?: string | null;
};

type WorkbenchTab = "sym" | "layers" | "data" | "settings";

type WorkbenchLayerConfig = {
  field: string | null;
  rampName: "Blues" | "Viridis";
  classes: number;
  opacity: number;
  singleColor: string;
  outlineColor: string;
  weight: number;
  rasterMode: "classified" | "continuous";
  classify: "quantile" | "equal" | "manual";
  manualBreaks: string;
  min: number;
  max: number;
};

const WORKBENCH_TABS: { id: WorkbenchTab; label: string }[] = [
  { id: "sym", label: "符号" },
  { id: "layers", label: "图层" },
  { id: "data", label: "数据" },
  { id: "settings", label: "设置" },
];

export function getWorkbenchTabs(): { id: WorkbenchTab; label: string }[] {
  return WORKBENCH_TABS;
}

export function buildSupportedUploadAccept(): string {
  return ".zip,.tif,.tiff,.geojson,.json,.gpkg,.kml,.kmz,.csv";
}

export function buildGaodeVectorTileUrl(): string {
  return "https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
}

export function buildDefaultLayerConfig(type: WorkbenchLayer["type"]): WorkbenchLayerConfig {
  return {
    field: null,
    rampName: type === "raster" ? "Viridis" : "Blues",
    classes: 5,
    opacity: 0.9,
    singleColor: "#2563eb",
    outlineColor: "",
    weight: 2.5,
    rasterMode: "classified",
    classify: "quantile",
    manualBreaks: "",
    min: 0,
    max: 100,
  };
}

export function buildLayerFromDataset(dataset: Pick<DatasetSummary, "id" | "name" | "type">): WorkbenchLayer {
  const type = dataset.type === "raster" ? "raster" : "vector";
  return {
    id: dataset.id,
    name: dataset.name,
    type,
    visible: true,
    config: buildDefaultLayerConfig(type),
    previewGeoJson: type === "vector" ? buildPreviewGeoJsonForDataset(dataset) : null,
  };
}

export function buildPreviewGeoJsonForDataset(
  dataset: Pick<DatasetSummary, "id" | "name" | "type">,
): GeoJsonFeatureCollection {
  const seed = dataset.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const lng = 115.8 + (seed % 26) * 0.09;
  const lat = 38.2 + (seed % 18) * 0.08;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          dataset_id: dataset.id,
          name: dataset.name,
          type: dataset.type,
          preview_note: "预览派生文件尚未生成，当前显示占位要素",
        },
        geometry: { type: "Point", coordinates: [lng, lat] },
      },
    ],
  };
}

const HEBEI_CITY_CODES = [
  130100, 130200, 130300, 130400, 130500, 130600, 130700, 130800, 130900, 131000, 131100,
];

export function buildJingJinJiAdminBoundaryUrls(): string[] {
  const base = "https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=";
  return [
    `${base}110000_full`,
    `${base}120000_full`,
    `${base}130000_full`,
    `${base}110000`,
    `${base}120000`,
    ...HEBEI_CITY_CODES.map((code) => `${base}${code}_full`),
  ];
}

function adminBoundaryUrl(code: string | number): string {
  return `https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=${code}`;
}

function buildParentAdminBoundaryUrls(): string[] {
  return [adminBoundaryUrl("110000"), adminBoundaryUrl("120000"), adminBoundaryUrl("130000_full")];
}

function buildLeafAdminBoundaryUrls(): string[] {
  return [
    adminBoundaryUrl("110000_full"),
    adminBoundaryUrl("120000_full"),
    ...HEBEI_CITY_CODES.map((code) => adminBoundaryUrl(`${code}_full`)),
  ];
}

export function normalizeAdminBoundaryFeature(rawFeature: {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: PolygonGeometry | MultiPolygonGeometry;
}): RegionFeature {
  const properties = rawFeature.properties ?? {};
  const id = String(properties.adcode ?? properties.id ?? "");
  const name = String(properties.name ?? id);

  return {
    type: "Feature",
    properties: {
      ...properties,
      id,
      name,
      level: String(properties.level ?? "admin"),
    },
    geometry: rawFeature.geometry,
  };
}

async function fetchAdminBoundaryFeatures(url: string, fetcher: typeof fetch): Promise<RegionFeature[]> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return [];
    const body = (await response.json()) as { features?: RegionFeature[] };
    return (body.features ?? [])
      .filter((feature) => feature?.type === "Feature" && feature.geometry)
      .map((feature) => normalizeAdminBoundaryFeature(feature));
  } catch {
    return [];
  }
}

export async function loadJingJinJiAdminBoundaryCache(fetcher: typeof fetch = fetch): Promise<AdminBoundaryCache> {
  const [parentGroups, leafGroups] = await Promise.all([
    Promise.all(buildParentAdminBoundaryUrls().map((url) => fetchAdminBoundaryFeatures(url, fetcher))),
    Promise.all(buildLeafAdminBoundaryUrls().map((url) => fetchAdminBoundaryFeatures(url, fetcher))),
  ]);

  const parents = parentGroups.flat();
  const leafs = leafGroups.flat();
  return {
    parents: parents.length ? parents : getJingJinJiRegionCollection().features,
    leafs: leafs.length ? leafs : getJingJinJiRegionCollection().features,
  };
}

export async function loadJingJinJiAdminBoundaryCollection(fetcher: typeof fetch = fetch): Promise<RegionCollection> {
  const cache = await loadJingJinJiAdminBoundaryCache(fetcher);
  const featuresById = new Map<string, RegionFeature>();
  [...cache.parents, ...cache.leafs].forEach((feature) => {
    if (feature.properties.id) featuresById.set(feature.properties.id, feature);
  });

  const features = Array.from(featuresById.values());
  if (features.length === 0) return getJingJinJiRegionCollection();
  return { type: "FeatureCollection", features };
}

export function htmlDemoParentAdminStyle(): PathOptions & { interactive: false } {
  return {
    color: "#60a5fa",
    weight: 2,
    dashArray: "5, 10",
    fillColor: "#3b82f6",
    fillOpacity: 0.05,
    interactive: false,
  };
}

export function htmlDemoCurrentAdminStyle(): PathOptions & { interactive: false } {
  return {
    color: "#fbbf24",
    weight: 3,
    fillColor: "#fbbf24",
    fillOpacity: 0.2,
    interactive: false,
  };
}

function ringContainsLngLat(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContainsLngLat(polygon: number[][][], lng: number, lat: number): boolean {
  if (!polygon.length || !ringContainsLngLat(polygon[0], lng, lat)) return false;
  return !polygon.slice(1).some((hole) => ringContainsLngLat(hole, lng, lat));
}

function geometryContainsLngLat(geometry: PolygonGeometry | MultiPolygonGeometry, lng: number, lat: number): boolean {
  if (geometry.type === "Polygon") return polygonContainsLngLat(geometry.coordinates, lng, lat);
  return geometry.coordinates.some((polygon) => polygonContainsLngLat(polygon, lng, lat));
}

export function findAdminLeafAtLngLat(cache: AdminBoundaryCache, lng: number, lat: number): RegionFeature | null {
  return cache.leafs.find((feature) => geometryContainsLngLat(feature.geometry, lng, lat)) ?? null;
}

function featureAdcode(feature: RegionFeature): string {
  return String(feature.properties.adcode ?? feature.properties.id);
}

export function findParentAdminFeature(cache: AdminBoundaryCache, leafFeature: RegionFeature): RegionFeature | null {
  const parentAdcode = leafFeature.properties.parent?.adcode;
  if (parentAdcode) {
    const exactParent = cache.parents.find((parent) => featureAdcode(parent) === String(parentAdcode));
    if (exactParent) return exactParent;
  }

  const adcode = featureAdcode(leafFeature);
  const cityPrefix = `${adcode.substring(0, 4)}00`;
  const provincePrefix = `${adcode.substring(0, 2)}0000`;
  return cache.parents.find((parent) => featureAdcode(parent) === cityPrefix || featureAdcode(parent) === provincePrefix) ?? null;
}

export function upsertWorkbenchLayer(layers: WorkbenchLayer[], nextLayer: WorkbenchLayer): WorkbenchLayer[] {
  return [nextLayer, ...layers.filter((layer) => layer.id !== nextLayer.id)];
}

export function mergeLibraryDatasets<T extends Pick<DatasetSummary, "id">>(current: T[], incoming: T[]): T[] {
  const incomingIds = new Set(incoming.map((dataset) => dataset.id));
  return [...incoming, ...current.filter((dataset) => !incomingIds.has(dataset.id))];
}

export function buildInitialWorkbenchLayers(): WorkbenchLayer[] {
  return [
    {
      id: "admin-boundaries",
      name: "京津冀行政区划",
      type: "vector",
      visible: true,
      config: buildDefaultLayerConfig("vector"),
      previewGeoJson: null,
    },
    {
      id: "resilience-demo",
      name: "城市韧性示例成果",
      type: "vector",
      visible: true,
      config: buildDefaultLayerConfig("vector"),
      previewGeoJson: buildPreviewGeoJsonForDataset({
        id: "resilience-demo",
        name: "城市韧性示例成果",
        type: "vector",
      }),
    },
  ];
}

export function formatLayerMeta(layer: { id: string; type: WorkbenchLayer["type"]; name?: string; visible?: boolean }): string {
  return `${layer.type === "raster" ? "Raster" : "Vector"} · ${layer.id}`;
}

function formatOpacity(config: WorkbenchLayerConfig): string {
  return `${Math.round(config.opacity * 100)}%`;
}

function parsePanelTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function defaultDatasetName(file: File): string {
  return file.name.replace(/\.[^/.]+$/, "") || file.name;
}

function vectorLayerStyle(layer: WorkbenchLayer): PathOptions {
  return {
    color: layer.config.singleColor,
    fillColor: layer.config.singleColor,
    fillOpacity: layer.config.opacity,
    opacity: layer.config.opacity,
    weight: layer.config.weight,
    radius: 7,
    stroke: true,
    fill: true,
  } as PathOptions & { radius: number };
}

export function getJingJinJiRegionCollection(): RegionCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "110000", name: "北京市", level: "province" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [115.45, 39.42],
              [117.55, 39.42],
              [117.55, 41.08],
              [115.45, 41.08],
              [115.45, 39.42],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { id: "120000", name: "天津市", level: "province" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [116.65, 38.55],
              [118.15, 38.55],
              [118.15, 40.25],
              [116.65, 40.25],
              [116.65, 38.55],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { id: "130100", name: "石家庄市", level: "city" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [113.4, 37.45],
              [115.55, 37.45],
              [115.55, 38.75],
              [113.4, 38.75],
              [113.4, 37.45],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { id: "130600", name: "保定市", level: "city" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [114.3, 38.35],
              [116.55, 38.35],
              [116.55, 39.75],
              [114.3, 39.75],
              [114.3, 38.35],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { id: "130200", name: "唐山市", level: "city" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [117.25, 39.15],
              [119.45, 39.15],
              [119.45, 40.45],
              [117.25, 40.45],
              [117.25, 39.15],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { id: "131000", name: "廊坊市", level: "city" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [116.05, 39.05],
              [117.65, 39.05],
              [117.65, 40.1],
              [116.05, 40.1],
              [116.05, 39.05],
            ],
          ],
        },
      },
    ],
  };
}

export function regionPropertiesFromFeature(feature: RegionFeature): { id: string; name: string } {
  return { id: feature.properties.id, name: feature.properties.name };
}

export function regionFeatureStyle(regionId: string, selectedRegionId: string | null): PathOptions {
  const selected = regionId === selectedRegionId;
  return {
    color: selected ? "#0f766e" : "#2b6cb0",
    fillColor: selected ? "#14b8a6" : "#60a5fa",
    fillOpacity: selected ? 0.42 : 0.18,
    opacity: 0.95,
    weight: selected ? 4 : 2,
  };
}

export function buildDemoRegionDatasets(regionId: string, regionName: string): RegionState {
  const suffix = regionId.slice(-2);
  return {
    regionName,
    datasets: [
      { id: `demo-${regionId}-resilience`, name: `${regionName}城市韧性评价示例成果` },
      { id: `demo-${regionId}-transport`, name: `${regionName}交通网络与人口暴露示例数据 ${suffix}` },
    ],
  };
}

export function MapWorkspacePage({ initialDatasetId, token = "" }: { initialDatasetId?: string; token?: string }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const adminBoundaryLayerRef = useRef<LayerGroup | null>(null);
  const previewLayerRefs = useRef<Record<string, LeafletGeoJSON<Record<string, unknown>>>>({});
  const initialDatasetLoadRef = useRef("");
  const [adminCache, setAdminCache] = useState<AdminBoundaryCache>(() => {
    const fallback = getJingJinJiRegionCollection().features;
    return { leafs: fallback, parents: fallback };
  });
  const [regionId, setRegionId] = useState("110000");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>("110000");
  const [regionState, setRegionState] = useState<RegionState>(buildDemoRegionDatasets("110000", "北京市"));
  const [layers, setLayers] = useState<WorkbenchLayer[]>(() => buildInitialWorkbenchLayers());
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("sym");
  const [activeLayerId, setActiveLayerId] = useState("resilience-demo");
  const [libraryDatasets, setLibraryDatasets] = useState<DatasetSummary[]>([]);
  const [adminStatusText, setAdminStatusText] = useState("正在加载行政区划");
  const [message, setMessage] = useState("");
  const [isMapReady, setMapReady] = useState(false);

  async function lookupRegion(nextRegionId: string, nextRegionName?: string) {
    const fallbackName =
      nextRegionName ??
      [...adminCache.leafs, ...adminCache.parents].find((feature) => feature.properties.id === nextRegionId)?.properties.name ??
      nextRegionId;

    setRegionId(nextRegionId);
    setSelectedRegionId(nextRegionId);
    setMessage("查询关联数据中");

    try {
      setRegionState(await loadRegionDatasets(token, nextRegionId));
      setMessage("");
    } catch {
      setRegionState(buildDemoRegionDatasets(nextRegionId, fallbackName));
      setMessage("后端暂不可用，当前显示本地演示数据");
    }
  }

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (!mapElementRef.current || cancelled) return;
      const map = leaflet.map(mapElementRef.current, {
        center: [39.35, 116.7],
        zoom: 8,
        zoomControl: false,
      });
      leaflet
        .tileLayer(buildGaodeVectorTileUrl(), {
          attribution: "AutoNavi",
          maxZoom: 18,
        })
        .addTo(map);
      map.createPane("adminPane");
      const adminPane = map.getPane("adminPane");
      if (adminPane) {
        adminPane.style.zIndex = "300";
        adminPane.style.pointerEvents = "none";
      }
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      Object.values(previewLayerRefs.current).forEach((layer) => {
        if (mapRef.current) layer.removeFrom(mapRef.current);
      });
      previewLayerRefs.current = {};
      if (adminBoundaryLayerRef.current && mapRef.current) adminBoundaryLayerRef.current.removeFrom(mapRef.current);
      adminBoundaryLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadJingJinJiAdminBoundaryCache()
      .then((cache) => {
        if (cancelled) return;
        setAdminCache(cache);
        setAdminStatusText(
          cache.leafs.length > getJingJinJiRegionCollection().features.length
            ? "就绪: 右键可清除选择"
            : "行政区划接口不可用，显示本地兜底",
        );
      })
      .catch(() => {
        if (!cancelled) setAdminStatusText("行政区划接口不可用，显示本地兜底");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setLibraryDatasets([]);
      return;
    }

    let cancelled = false;
    listDatasets(token)
      .then((items) => {
        if (!cancelled) {
          setLibraryDatasets((current) => mergeLibraryDatasets(current, items));
          setMessage("");
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage(`数据资源库暂不可用：${error.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!initialDatasetId || !token || initialDatasetLoadRef.current === initialDatasetId) return;
    const dataset = libraryDatasets.find((item) => item.id === initialDatasetId);
    if (!dataset) return;

    initialDatasetLoadRef.current = initialDatasetId;
    void loadDatasetToWorkbench(dataset);
  }, [initialDatasetId, libraryDatasets, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    let cancelled = false;
    let clickHandler: ((event: { latlng: { lng: number; lat: number }; originalEvent?: Event }) => void) | null = null;
    let contextHandler: ((event: { originalEvent?: Event }) => void) | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled) return;
      const clearBoundary = () => {
        if (adminBoundaryLayerRef.current) {
          adminBoundaryLayerRef.current.removeFrom(map);
          adminBoundaryLayerRef.current = null;
        }
        map.closePopup();
      };

      clickHandler = (event) => {
        const target = event.originalEvent?.target;
        if (target instanceof Element && target.closest(".leaflet-popup")) return;

        clearBoundary();
        const boundaryGroup = leaflet.layerGroup().addTo(map);
        adminBoundaryLayerRef.current = boundaryGroup;

        const leafFeature = findAdminLeafAtLngLat(adminCache, event.latlng.lng, event.latlng.lat);
        let locationTitle = "未知区域";

        if (leafFeature) {
          const parentFeature = findParentAdminFeature(adminCache, leafFeature);
          if (parentFeature) {
            leaflet.geoJSON(parentFeature, { pane: "adminPane", style: htmlDemoParentAdminStyle() }).addTo(boundaryGroup);
            locationTitle = `${parentFeature.properties.name} / ${leafFeature.properties.name}`;
          } else {
            locationTitle = leafFeature.properties.name;
          }

          leaflet.geoJSON(leafFeature, { pane: "adminPane", style: htmlDemoCurrentAdminStyle() }).addTo(boundaryGroup);
          void lookupRegion(leafFeature.properties.id, leafFeature.properties.name);
        } else {
          setMessage("未识别到行政区划");
        }

        leaflet
          .popup({ closeButton: true })
          .setLatLng([event.latlng.lat, event.latlng.lng])
          .setContent(`<div class="text-sm font-bold">${locationTitle}</div>`)
          .openOn(map);
      };

      contextHandler = (event) => {
        clearBoundary();
        event.originalEvent?.preventDefault();
      };

      map.on("click", clickHandler);
      map.on("contextmenu", contextHandler);
    });

    return () => {
      cancelled = true;
      if (clickHandler) map.off("click", clickHandler);
      if (contextHandler) map.off("contextmenu", contextHandler);
    };
  }, [adminCache, isMapReady, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (cancelled) return;
      Object.values(previewLayerRefs.current).forEach((layer) => layer.removeFrom(map));
      previewLayerRefs.current = {};

      layers.forEach((workbenchLayer) => {
        if (!workbenchLayer.visible || !workbenchLayer.previewGeoJson) return;
        const leafletLayer = leaflet.geoJSON(workbenchLayer.previewGeoJson, {
          style: () => vectorLayerStyle(workbenchLayer),
          onEachFeature: (feature, featureLayer) => {
            const props = ((feature as { properties?: Record<string, unknown> }).properties ?? {}) as Record<
              string,
              unknown
            >;
            (featureLayer as unknown as { bindPopup: (content: string) => void }).bindPopup(
              `<div class="font-bold">${workbenchLayer.name}</div><div class="text-xs">${String(
                props.preview_note ?? "数据预览",
              )}</div>`,
            );
          },
        });
        leafletLayer.addTo(map);
        previewLayerRefs.current[workbenchLayer.id] = leafletLayer as LeafletGeoJSON<Record<string, unknown>>;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isMapReady, layers]);

  async function handleRegionLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookupRegion(regionId);
  }

  function toggleWorkbenchLayer(layerId: string) {
    setLayers((current) =>
      current.map((layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)),
    );
  }

  function clearWorkbenchLayers() {
    setLayers([]);
    setActiveLayerId("");
  }

  function selectLayer(layerId: string) {
    setActiveLayerId(layerId);
    setActiveTab("sym");
  }

  function updateActiveLayerConfig(partial: Partial<WorkbenchLayerConfig>) {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === activeLayerId ? { ...layer, config: { ...layer.config, ...partial } } : layer,
      ),
    );
  }

  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
  const displayDatasets: Pick<DatasetSummary, "id" | "name" | "type" | "status" | "project" | "tags">[] =
    token && libraryDatasets.length > 0
      ? libraryDatasets
      : regionState.datasets.map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          type: "vector",
          status: token ? "pending" : "demo",
          project: token ? null : "演示数据",
          tags: token ? [] : ["京津冀", "韧性"],
        }));

  async function loadDatasetToWorkbench(dataset: Pick<DatasetSummary, "id" | "name" | "type">) {
    let nextLayer = buildLayerFromDataset(dataset);

    if (token && !dataset.id.startsWith("demo-")) {
      try {
        const preview = await getDatasetPreview(token, dataset.id);
        nextLayer = {
          ...nextLayer,
          previewGeoJson: preview.geojson ?? nextLayer.previewGeoJson,
          previewMessage: preview.message,
        };
        if (preview.preview_kind === "unavailable") {
          setMessage(preview.message ?? `${dataset.name} 暂不可预览，已加入图层列表`);
        }
      } catch (error) {
        setMessage(`预览接口暂不可用：${(error as Error).message}`);
      }
    }

    setLayers((current) => upsertWorkbenchLayer(current, nextLayer));
    setActiveLayerId(nextLayer.id);
    setActiveTab("sym");
    setMessage((current) => current || `${dataset.name} 已加入图层控制`);
  }

  async function downloadOriginalDataset(datasetId: string) {
    if (!token) {
      setMessage("演示模式不提供原始文件下载");
      return;
    }
    const result = await getDatasetDownload(token, datasetId);
    window.location.href = result.download_url;
  }

  async function refreshLibraryDatasets() {
    if (!token) {
      setMessage("演示模式下显示本地示例数据");
      return;
    }

    setMessage("正在刷新数据资源库");
    try {
      const items = await listDatasets(token);
      setLibraryDatasets((current) => mergeLibraryDatasets(current, items));
      setMessage("数据资源库已刷新，可加载 ready 数据到地图");
    } catch (error) {
      setMessage(`刷新失败：${(error as Error).message}`);
    }
  }

  async function handleDataPanelUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("请登录后上传数据");
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.name) {
      setMessage("请选择要上传的 GIS 文件");
      return;
    }

    const metadata: DatasetUploadMetadata = {
      name: String(data.get("name") || defaultDatasetName(file)),
      project: String(data.get("project") || ""),
      tags: parsePanelTags(String(data.get("tags") || "")),
      description: String(data.get("description") || ""),
    };

    const created = await uploadDataset(token, metadata, file);
    setLibraryDatasets((current) => [created, ...current.filter((dataset) => dataset.id !== created.id)]);
    setMessage(`${created.name} 已提交后台识别`);
    form.reset();
  }

  return (
    <section className="map-workspace">
      <header className="workbench-topbar">
        <div>
          <p className="eyebrow">Jing-Jin-Ji Resilience GIS</p>
          <h1>韧性城市与城市未来</h1>
        </div>
        <div className="workbench-status">
          <span className="status-dot" />
          <span>{adminStatusText}: 点击行政区发现成果</span>
        </div>
      </header>
      <div className="map-layout">
        <div className="map-panel">
          <form className="region-lookup" onSubmit={handleRegionLookup}>
            <label>
              行政区 ID
              <input onChange={(event) => setRegionId(event.target.value)} value={regionId} />
            </label>
            <button type="submit">查询关联数据</button>
          </form>
          {message && <p className="map-message">{message}</p>}
          <div className="map-stage">
            <div className="layer-manager-card">
              <div className="layer-manager-header">
                <span>图层控制 (TOC)</span>
                <button onClick={clearWorkbenchLayers} type="button">清空</button>
              </div>
              <div className="toc-list">
                {layers.length === 0 && <p>暂无加载图层</p>}
                {layers.map((layer) => (
                  <button
                    className={layer.id === activeLayer?.id ? "toc-row active" : "toc-row"}
                    key={layer.id}
                    onClick={() => selectLayer(layer.id)}
                    type="button"
                  >
                    <span className={layer.visible ? "toc-dot visible" : "toc-dot"} />
                    <span>{layer.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div aria-label="京津冀行政区地图" className="leaflet-map" ref={mapElementRef} />
          </div>
        </div>
        <aside className="workbench-sidebar">
          <div className="workbench-sidebar-header">
            <div>
              <p className="eyebrow">Console</p>
              <h2>控制台</h2>
            </div>
            <button type="button">主题</button>
          </div>
          <div className="workbench-tabs">
            {getWorkbenchTabs().map(({ id, label }) => (
              <button
                className={activeTab === id ? "active" : ""}
                key={id}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="workbench-tabpane">
            {activeTab === "sym" && (
              <div className="console-card">
                <div className="console-card-heading">
                  <div>
                    <h3>符号</h3>
                    <p>{activeLayer ? `Layer: ${activeLayer.name}` : "未选择图层"}</p>
                  </div>
                  {activeLayer && <span className="mode-pill">{formatLayerMeta(activeLayer)}</span>}
                </div>
                {activeLayer ? (
                  <div className="symbology-form">
                    <label>
                      透明度 <strong>{formatOpacity(activeLayer.config)}</strong>
                      <input
                        max="1"
                        min="0"
                        onChange={(event) => updateActiveLayerConfig({ opacity: Number(event.target.value) })}
                        step="0.1"
                        type="range"
                        value={activeLayer.config.opacity}
                      />
                    </label>
                    {activeLayer.type === "vector" && (
                      <>
                        <label>
                          渲染字段
                          <select
                            onChange={(event) => updateActiveLayerConfig({ field: event.target.value || null })}
                            value={activeLayer.config.field ?? ""}
                          >
                            <option value="">(无 - 单一颜色)</option>
                            <option value="resilience_index">resilience_index</option>
                            <option value="population">population</option>
                          </select>
                        </label>
                        <label>
                          填充颜色
                          <select
                            onChange={(event) => updateActiveLayerConfig({ singleColor: event.target.value })}
                            value={activeLayer.config.singleColor}
                          >
                            <option value="#2563eb">蓝 #2563eb</option>
                            <option value="#16a34a">绿 #16a34a</option>
                            <option value="#dc2626">红 #dc2626</option>
                            <option value="#f59e0b">橙 #f59e0b</option>
                          </select>
                        </label>
                        <label>
                          线宽 <strong>{activeLayer.config.weight.toFixed(1)}</strong>
                          <input
                            max="8"
                            min="1"
                            onChange={(event) => updateActiveLayerConfig({ weight: Number(event.target.value) })}
                            step="0.5"
                            type="range"
                            value={activeLayer.config.weight}
                          />
                        </label>
                      </>
                    )}
                    {activeLayer.type === "raster" && (
                      <>
                        <label>
                          渲染方式
                          <select
                            onChange={(event) =>
                              updateActiveLayerConfig({
                                rasterMode: event.target.value as WorkbenchLayerConfig["rasterMode"],
                              })
                            }
                            value={activeLayer.config.rasterMode}
                          >
                            <option value="classified">分段（推荐）</option>
                            <option value="continuous">连续渐变</option>
                          </select>
                        </label>
                        <label>
                          分段方式
                          <select
                            onChange={(event) =>
                              updateActiveLayerConfig({
                                classify: event.target.value as WorkbenchLayerConfig["classify"],
                              })
                            }
                            value={activeLayer.config.classify}
                          >
                            <option value="quantile">分位数</option>
                            <option value="equal">等距</option>
                            <option value="manual">手动</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      分级数 <strong>{activeLayer.config.classes}</strong>
                      <input
                        max={activeLayer.type === "raster" ? 12 : 9}
                        min="3"
                        onChange={(event) => updateActiveLayerConfig({ classes: Number(event.target.value) })}
                        type="range"
                        value={activeLayer.config.classes}
                      />
                    </label>
                    <div className="legend-preview">
                      <span>当前图例</span>
                      <div className="legend-ramp" />
                    </div>
                  </div>
                ) : (
                  <p className="empty-console-text">暂无图层</p>
                )}
              </div>
            )}
            {activeTab === "layers" && (
              <div className="console-card">
                <div className="console-card-heading">
                  <div>
                    <h3>图层</h3>
                    <p>显示隐藏 / 样式 / 定位 / 移除</p>
                  </div>
                  <button onClick={clearWorkbenchLayers} type="button">清空</button>
                </div>
                <div className="layer-card-list">
                  {layers.length === 0 && <p className="empty-console-text">暂无图层</p>}
                  {layers.map((layer) => (
                    <article
                      className={layer.id === activeLayer?.id ? "workbench-layer-card active" : "workbench-layer-card"}
                      key={layer.id}
                      onClick={() => selectLayer(layer.id)}
                    >
                      <button
                        aria-label={layer.visible ? "隐藏图层" : "显示图层"}
                        className="icon-button"
                        onClick={() => toggleWorkbenchLayer(layer.id)}
                        type="button"
                      >
                        {layer.visible ? "●" : "○"}
                      </button>
                      <div>
                        <h4>{layer.name}</h4>
                        <p>{formatLayerMeta(layer)} · 透明度 {formatOpacity(layer.config)}</p>
                      </div>
                      <button className="icon-button" type="button">⌖</button>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "data" && (
              <div className="console-card">
                <div className="console-card-heading">
                  <div>
                    <h3>数据资源库</h3>
                    <p>拖拽上传 / 后台识别 / 一键加载到地图</p>
                  </div>
                  <button onClick={() => void refreshLibraryDatasets()} type="button">刷新</button>
                </div>
                <form className="demo-dropzone" onSubmit={handleDataPanelUpload}>
                  <strong>拖拽 GIS 文件到这里上传</strong>
                  <span>支持 Shapefile zip、GeoTIFF、GeoJSON、GeoPackage、KML/KMZ、CSV</span>
                  <input accept={buildSupportedUploadAccept()} aria-label="上传 GIS 文件" name="file" type="file" />
                  <input name="name" placeholder="数据名称（默认使用文件名）" />
                  <input name="project" placeholder="所属项目/主题" />
                  <input name="tags" placeholder="标签：韧性, 交通, 道路" />
                  <button type="submit">上传入库</button>
                </form>
                <div className="dataset-mini-list">
                  {displayDatasets.map((dataset) => (
                    <article key={dataset.id}>
                      <span>{dataset.type === "raster" ? "▦" : "⌖"}</span>
                      <div>
                        <strong>{dataset.name}</strong>
                        <small>{dataset.project || dataset.status || "可加载到地图预览"}</small>
                      </div>
                      <div className="dataset-actions">
                        <button onClick={() => void loadDatasetToWorkbench(dataset)} type="button">加载</button>
                        <button onClick={() => void downloadOriginalDataset(dataset.id)} type="button">下载</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "settings" && (
              <>
                <AdminRegionDiscovery
                  datasets={regionState.datasets}
                  onLoadDataset={(dataset) =>
                    void loadDatasetToWorkbench({
                      id: dataset.id,
                      name: dataset.name,
                      type: dataset.type ?? "vector",
                    })
                  }
                  regionName={regionState.regionName}
                />
                <div className="console-card">
                  <h3>快捷键</h3>
                  <p><span className="kbd">Ctrl</span> + <span className="kbd">L</span> 打开图层</p>
                  <p><span className="kbd">Ctrl</span> + <span className="kbd">D</span> 打开数据</p>
                  <p><span className="kbd">Ctrl</span> + <span className="kbd">U</span> 上传数据</p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
