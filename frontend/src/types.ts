import type { FeatureCollection, Geometry } from 'geojson'

export type DataMode = 'shared' | 'local'
export type DatasetType = 'vector' | 'raster'
export type DatasetStatus = 'processing' | 'ready' | 'failed'
export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface User {
  id: string
  username: string
  display_name: string
  is_admin?: boolean
}

export interface AdminUser extends User {
  created_at: string
  workspace_count: number
  is_blocked: boolean
  is_admin: boolean
}

export interface AdminOverview {
  user_count: number
  active_user_count: number
  blocked_user_count: number
  workspace_count: number
  dataset_count: number
  storage_bytes: number
}

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  owner_id: string
  owner_name: string
  owner_username: string
  member_count: number
  dataset_count: number
  storage_bytes: number
  created_at: string
}

export interface AdminDataset {
  id: string
  name: string
  workspace_id: string
  workspace_name: string
  owner_id: string
  owner_name: string
  type: DatasetType
  status: DatasetStatus
  source_filename: string
  size_bytes: number
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  role: WorkspaceRole
}

export interface WorkspaceApplication {
  id: string
  user_id: string
  username: string
  display_name: string
  status: 'pending' | 'approved' | 'rejected'
  requested_role: WorkspaceRole
  created_at: string
}
export interface FieldInfo {
  name: string
  type: 'number' | 'text' | 'date'
}

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Dataset {
  id: string
  workspace_id: string
  owner_id: string
  owner_name?: string | null
  name: string
  description?: string | null
  type: DatasetType
  status: DatasetStatus
  error_message?: string | null
  geometry_type?: string | null
  source_crs?: string | null
  bounds: Bounds | null
  fields: FieldInfo[]
  statistics: Record<string, unknown>
  style: Partial<LayerStyle>
  source_filename: string
  size_bytes: number
  feature_count?: number | null
  created_at: string
  updated_at: string
  local?: boolean
}

export interface LayerStyle {
  opacity: number
  field: string | null
  rampName: string
  classes: number
  singleColor: string
  outlineColor: string
  weight: number
  radius: number
  rasterMode: 'classified' | 'continuous'
  classify: 'quantile' | 'equal' | 'manual'
  manualBreaks: string
  min: number
  max: number
  breaks: number[]
}

export interface LoadedLayer {
  dataset: Dataset
  visible: boolean
  style: LayerStyle
  loading: boolean
  error?: string
}

export interface IdentifyResult {
  region: {
    adcode: string
    name: string
    level: string
    parent?: string | null
    geometry: Geometry
  } | null
  datasets: Dataset[]
  point: { lat: number; lng: number }
}

export interface LocalDatasetRecord {
  meta: Dataset
  preview: FeatureCollection | ArrayBuffer
  source: Blob
}

