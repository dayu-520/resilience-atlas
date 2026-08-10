import { booleanPointInPolygon, point } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import localforage from 'localforage'

type RegionFeature = Feature<Polygon | MultiPolygon, { adcode: number; name: string; parent?: { adcode?: number } }>
const cache = localforage.createInstance({ name: 'ResilienceAtlas', storeName: 'adminBoundaries' })
const KEY = 'jjj-v1'
let memory: RegionFeature[] | null = null

export async function loadAdminBoundaries(): Promise<RegionFeature[]> {
  if (memory) return memory
  const stored = await cache.getItem<RegionFeature[]>(KEY)
  if (stored?.length) return (memory = stored)
  const codes = ['110000_full', '120000_full', '130100_full', '130200_full', '130300_full', '130400_full', '130500_full', '130600_full', '130700_full', '130800_full', '130900_full', '131000_full', '131100_full']
  const responses = await Promise.allSettled(codes.map(async (code) => {
    const response = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=${code}`)
    if (!response.ok) throw new Error('行政区数据下载失败')
    return response.json() as Promise<FeatureCollection<Polygon | MultiPolygon, RegionFeature['properties']>>
  }))
  memory = responses.flatMap((result) => result.status === 'fulfilled' ? result.value.features : []) as RegionFeature[]
  if (memory.length) await cache.setItem(KEY, memory)
  return memory
}

export async function identifyAdmin(lng: number, lat: number) {
  const target = point([lng, lat])
  const regions = await loadAdminBoundaries()
  const leaf = regions.find((feature) => booleanPointInPolygon(target, feature))
  if (!leaf) return null
  return { adcode: String(leaf.properties.adcode), name: leaf.properties.name, level: 'district', parent: null, geometry: leaf.geometry }
}
