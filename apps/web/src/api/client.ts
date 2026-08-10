export type DatasetSummary = {
  id: string;
  name: string;
  tags: string[];
  type: string;
  project?: string | null;
  status?: string;
  uploaded_at?: string;
  description?: string | null;
  original_filename?: string;
  processing_message?: string | null;
  srid?: number | null;
  fields?: Record<string, unknown>[];
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

type DatasetFilters = {
  q?: string;
  type?: string;
  status?: string;
  uploader_id?: string;
};

export type DatasetUploadMetadata = {
  name: string;
  project?: string;
  tags: string[];
  description?: string;
};

export type DatasetDownload = {
  download_url: string;
  expires_in: number;
};

export type RegionDatasetsResponse = {
  region: { id: string; name: string };
  datasets: DatasetSummary[];
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
};

export type DatasetPreview = {
  id: string;
  name: string;
  type: string;
  status: string;
  preview_kind: "geojson" | "raster" | "unavailable";
  geojson: GeoJsonFeatureCollection | null;
  preview_url: string | null;
  message: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
};

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function datasetQueryString(filters: DatasetFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function listDatasets(token: string, filters: DatasetFilters = {}): Promise<DatasetSummary[]> {
  return apiGet<DatasetSummary[]>(`/datasets${datasetQueryString(filters)}`, token);
}

export async function getDataset(token: string, datasetId: string): Promise<DatasetSummary> {
  return apiGet<DatasetSummary>(`/datasets/${datasetId}`, token);
}

export async function uploadDataset(
  token: string,
  metadata: DatasetUploadMetadata,
  file: File,
): Promise<DatasetSummary> {
  const body = new FormData();
  body.set("name", metadata.name);
  if (metadata.project) body.set("project", metadata.project);
  if (metadata.tags.length > 0) body.set("tags", metadata.tags.join(","));
  if (metadata.description) body.set("description", metadata.description);
  body.set("file", file);

  const response = await fetch(`${API_BASE}/datasets`, {
    method: "POST",
    headers: authHeaders(token),
    body,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<DatasetSummary>;
}

export async function getDatasetDownload(token: string, datasetId: string): Promise<DatasetDownload> {
  return apiGet<DatasetDownload>(`/datasets/${datasetId}/download`, token);
}

export async function getDatasetPreview(token: string, datasetId: string): Promise<DatasetPreview> {
  return apiGet<DatasetPreview>(`/datasets/${datasetId}/preview`, token);
}

export async function getRegionDatasets(token: string, regionId: string): Promise<RegionDatasetsResponse> {
  return apiGet<RegionDatasetsResponse>(`/admin-regions/${regionId}/datasets`, token);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<LoginResponse>;
}
