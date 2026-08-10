import { bbox as turfBbox } from '@turf/turf'
import type { FeatureCollection, Geometry } from 'geojson'
import localforage from 'localforage'
import proj4 from 'proj4'
import type { Dataset, FieldInfo, LocalDatasetRecord } from '../types'

const db = localforage.createInstance({ name: 'ResilienceAtlas', storeName: 'localDatasets' })
const META_KEY = '__meta__'

async function metas(): Promise<Dataset[]> {
  return (await db.getItem<Dataset[]>(META_KEY)) || []
}

async function setMetas(items: Dataset[]) {
  await db.setItem(META_KEY, items)
}

function fieldsOf(collection: FeatureCollection): FieldInfo[] {
  const values = collection.features.slice(0, 200)
  const keys = new Set(values.flatMap((feature) => Object.keys(feature.properties || {})))
  return [...keys].map((name) => {
    const sample = values.map((feature) => feature.properties?.[name]).find((value) => value != null && value !== '')
    return { name, type: typeof sample === 'number' || (sample != null && Number.isFinite(Number(sample))) ? 'number' : 'text' }
  })
}

function geometryKind(collection: FeatureCollection) {
  const kinds = new Set(collection.features.map((feature) => feature.geometry?.type).filter(Boolean))
  return kinds.size === 1 ? [...kinds][0] || null : 'Mixed'
}

function transformCoordinates(value: unknown, from: string): unknown {
  if (!Array.isArray(value)) return value
  if (typeof value[0] === 'number' && typeof value[1] === 'number') return proj4(from, 'EPSG:4326', value as [number, number])
  return value.map((child) => transformCoordinates(child, from))
}

function projectCollection(collection: FeatureCollection, from: string): FeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry ? { ...feature.geometry, coordinates: transformCoordinates((feature.geometry as Geometry & { coordinates: unknown }).coordinates, from) } as Geometry : feature.geometry,
    })),
  }
}

async function ensureProjection(epsg: string) {
  const clean = epsg.replace(/^EPSG:/i, '')
  const name = `EPSG:${clean}`
  if (!proj4.defs(name)) {
    const response = await fetch(`https://epsg.io/${clean}.proj4`)
if (!response.ok) throw new Error(`无法获取 EPSG:${clean} 的投影定义`)
    proj4.defs(name, await response.text())
  }
  return name
}

function normalizeCollection(result: FeatureCollection | FeatureCollection[]): FeatureCollection {
  if (!Array.isArray(result)) return result
  return { type: 'FeatureCollection', features: result.flatMap((item) => item.features) }
}

function makeMeta(input: Partial<Dataset> & Pick<Dataset, 'id' | 'name' | 'type' | 'bounds' | 'fields' | 'statistics' | 'source_filename' | 'size_bytes'>): Dataset {
  const now = new Date().toISOString()
  return {
    workspace_id: 'local', owner_id: 'local', status: 'ready', style: {}, created_at: now, updated_at: now, local: true,
    ...input,
  }
}

export const localRepository = {
  list: metas,
  async get(id: string) { return db.getItem<LocalDatasetRecord>(id) },
  async remove(id: string) {
    await db.removeItem(id)
    await setMetas((await metas()).filter((item) => item.id !== id))
  },
  async ingest(file: File, name: string, epsg?: string): Promise<Dataset> {
    const extension = file.name.split('.').pop()?.toLowerCase()
    const id = `local-${crypto.randomUUID()}`
    const source = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' })
    let record: LocalDatasetRecord

    if (extension === 'tif' || extension === 'tiff') {
      const buffer = await file.arrayBuffer()
      const { default: parseGeoraster } = await import('georaster')
      const raster = await parseGeoraster(buffer.slice(0))
      let west = raster.xmin, east = raster.xmax, south = raster.ymin, north = raster.ymax
      const projection = epsg || (raster.projection ? String(raster.projection) : '')
      if (projection && (Math.abs(west) > 180 || Math.abs(south) > 90)) {
        const from = await ensureProjection(projection)
        const sw = proj4(from, 'EPSG:4326', [west, south])
        const ne = proj4(from, 'EPSG:4326', [east, north])
        ;[west, south, east, north] = [sw[0], sw[1], ne[0], ne[1]]
      }
      const min = Number(raster.mins?.[0] ?? 0)
      const max = Number(raster.maxs?.[0] ?? 100)
      const meta = makeMeta({ id, name, type: 'raster', bounds: { west, south, east, north }, fields: [], statistics: { min, max, bands: 1 }, source_crs: projection ? `EPSG:${projection.replace(/^EPSG:/i, '')}` : null, source_filename: file.name, size_bytes: file.size })
      record = { meta, preview: buffer, source }
    } else {
      let collection: FeatureCollection
      if (extension === 'zip') {
        const { default: shp } = await import('shpjs')
        collection = normalizeCollection(await shp(await file.arrayBuffer()))
      }
      else collection = JSON.parse(await file.text()) as FeatureCollection
      if (!collection || collection.type !== 'FeatureCollection') throw new Error('文件不是有效的 GeoJSON FeatureCollection')
      if (epsg) {
        const bb = turfBbox(collection)
        if (Math.abs(bb[0]) > 180 || Math.abs(bb[1]) > 90) collection = projectCollection(collection, await ensureProjection(epsg))
      }
      const [west, south, east, north] = turfBbox(collection)
      const fields = fieldsOf(collection)
      const fieldStats: Record<string, { min: number; max: number }> = {}
      for (const field of fields.filter((item) => item.type === 'number')) {
        const values = collection.features.map((feature) => Number(feature.properties?.[field.name])).filter(Number.isFinite)
        if (values.length) fieldStats[field.name] = { min: Math.min(...values), max: Math.max(...values) }
      }
      const meta = makeMeta({ id, name, type: 'vector', bounds: { west, south, east, north }, fields, statistics: { fields: fieldStats }, geometry_type: geometryKind(collection), source_crs: epsg ? `EPSG:${epsg}` : 'EPSG:4326', source_filename: file.name, size_bytes: file.size, feature_count: collection.features.length })
      record = { meta, preview: collection, source }
    }
    await db.setItem(id, record)
    await setMetas([record.meta, ...(await metas()).filter((item) => item.id !== id)])
    return record.meta
  },
  async download(id: string) {
    const record = await db.getItem<LocalDatasetRecord>(id)
    if (!record) throw new Error('本地数据已丢失')
    const url = URL.createObjectURL(record.source)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = record.meta.source_filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
