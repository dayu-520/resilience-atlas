import { bbox as turfBbox } from '@turf/turf'
import type { FeatureCollection } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useAppStore } from '../store'
import type { Dataset, IdentifyResult } from '../types'
import { api } from '../lib/api'
import { identifyAdmin, loadAdminBoundaries } from '../lib/adminCache'
import { localRepository } from '../lib/localRepository'
import { rasterPreviewImage, styleVector, type BrowserRaster } from '../lib/mapStyles'

export interface MapCanvasHandle {
  zoomToDataset: (dataset: Dataset) => void
  clearIdentify: () => void
}

type RuntimeLayer = {
  layer: L.Layer
  vectorData?: FeatureCollection
  rasterLayer?: L.ImageOverlay
  rasterData?: BrowserRaster
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

function popupFor(name: string, properties: Record<string, unknown> | null | undefined) {
  const rows = Object.entries(properties || {}).slice(0, 60).map(([key, value]) => `<div class="feature-row"><b>${escapeHtml(key)}</b><span>${escapeHtml(value)}</span></div>`).join('')
return `<div class="feature-popup"><div class="feature-title">${escapeHtml(name)}</div>${rows || '<div class="muted">无属性</div>'}</div>`
}

function intersects(bounds: Dataset['bounds'], box: [number, number, number, number]) {
  return !!bounds && bounds.west <= box[2] && bounds.east >= box[0] && bounds.south <= box[3] && bounds.north >= box[1]
}

export const MapCanvas = forwardRef<MapCanvasHandle>(function MapCanvas(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const runtimeRef = useRef(new Map<string, RuntimeLayer>())
  const loadingRef = useRef(new Set<string>())
  const adminLayerRef = useRef<L.GeoJSON | null>(null)
  const layers = useAppStore((state) => state.layers)
  const datasets = useAppStore((state) => state.datasets)
  const mode = useAppStore((state) => state.mode)
  const workspace = useAppStore((state) => state.workspace)
  const setIdentify = useAppStore((state) => state.setIdentify)
  const identify = useAppStore((state) => state.identify)
  const setLayerRuntimeState = useAppStore((state) => state.setLayerRuntimeState)
  const updateLayerStyle = useAppStore((state) => state.updateLayerStyle)
  const notify = useAppStore((state) => state.notify)

  useImperativeHandle(ref, () => ({
    zoomToDataset(dataset) {
      if (!dataset.bounds || !mapRef.current) return
      mapRef.current.fitBounds([[dataset.bounds.south, dataset.bounds.west], [dataset.bounds.north, dataset.bounds.east]], { padding: [42, 42] })
    },
    clearIdentify() {
      adminLayerRef.current?.remove()
      adminLayerRef.current = null
      mapRef.current?.closePopup()
      setIdentify(null)
    },
  }), [setIdentify])

  useEffect(() => {
    if (identify) return
    adminLayerRef.current?.remove()
    adminLayerRef.current = null
    mapRef.current?.closePopup()
  }, [identify])


  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const runtimeLayers = runtimeRef.current
    const loadingLayers = loadingRef.current
    const map = L.map(containerRef.current, {
      zoomControl: false,
      doubleClickZoom: false,
      minZoom: 5,
      maxBounds: L.latLngBounds([32, 108], [46, 124]),
      maxBoundsViscosity: 0.6,
      preferCanvas: true,
    }).setView([39.3, 116.45], 7)
    mapRef.current = map

    const road = L.tileLayer('https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { attribution: '高德地图', maxZoom: 18 })
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri', maxZoom: 19 })
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: 'CARTO', maxZoom: 20 })
    const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: 'CARTO', maxZoom: 20 })
    road.addTo(map)
    L.control.layers({ '高德路网': road, 'ArcGIS 卫星': satellite, '深色底图': dark, '浅色底图': light }, undefined, { position: 'bottomleft' }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map)
    map.createPane('admin-selection')
    const pane = map.getPane('admin-selection')
    if (pane) { pane.style.zIndex = '620'; pane.style.pointerEvents = 'none' }

    map.on('contextmenu', (event) => {
      event.originalEvent.preventDefault()
      adminLayerRef.current?.remove()
      adminLayerRef.current = null
      setIdentify(null)
      map.closePopup()
    })
    void loadAdminBoundaries().catch(() => undefined)
    return () => {
      runtimeLayers.clear()
      loadingLayers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [setIdentify])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const onDoubleClick = async (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng
      try {
        let result: IdentifyResult
        if (mode === 'shared' && workspace) {
          result = await api.identify(workspace.id, lng, lat)
        } else {
          const region = await identifyAdmin(lng, lat).catch(() => null)
          const queryBox = region ? turfBbox(region.geometry) : [lng, lat, lng, lat]
          result = { region, datasets: datasets.filter((dataset) => intersects(dataset.bounds, queryBox as [number, number, number, number])), point: { lat, lng } }
        }
        adminLayerRef.current?.remove()
        if (result.region?.geometry) {
          adminLayerRef.current = L.geoJSON(result.region.geometry, { pane: 'admin-selection', style: { color: '#ffcc66', weight: 3, fillColor: '#ffcc66', fillOpacity: 0.12, dashArray: '8 7' }, interactive: false }).addTo(map)
        }
        setIdentify(result)
      } catch (error) {
notify({ type: 'error', message: error instanceof Error ? error.message : '空间识别失败' })
      }
    }
    map.on('dblclick', onDoubleClick)
    return () => { map.off('dblclick', onDoubleClick) }
  }, [datasets, mode, notify, setIdentify, workspace])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const wanted = new Set(layers.map((item) => item.dataset.id))
    for (const [id, runtime] of runtimeRef.current) {
      if (!wanted.has(id)) {
        runtime.layer.remove()
        runtimeRef.current.delete(id)
      }
    }

    for (const item of layers) {
      if (runtimeRef.current.has(item.dataset.id) || loadingRef.current.has(item.dataset.id)) continue
      loadingRef.current.add(item.dataset.id)
      setLayerRuntimeState(item.dataset.id, { loading: true, error: undefined })
      void (async () => {
        try {
          let payload: FeatureCollection | ArrayBuffer
          if (item.dataset.local) {
            const record = await localRepository.get(item.dataset.id)
            if (!record) throw new Error('本地数据已丢失')
            payload = record.preview
          } else {
            const response = await api.preview(item.dataset.id)
            payload = item.dataset.type === 'vector' ? await response.json() as FeatureCollection : await response.arrayBuffer()
          }
          const currentMap = mapRef.current
          if (!currentMap || !useAppStore.getState().layers.some((layer) => layer.dataset.id === item.dataset.id)) return
          if (item.dataset.type === 'vector') {
            const collection = payload as FeatureCollection
            const layer = L.geoJSON(collection, {
              pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: item.style.radius }),
              onEachFeature: (feature, featureLayer) => featureLayer.bindPopup(popupFor(item.dataset.name, feature.properties as Record<string, unknown>)),
            })
            const breaks = styleVector(layer, collection, item.style)
            if (!item.visible) layer.remove()
            else layer.addTo(currentMap)
            runtimeRef.current.set(item.dataset.id, { layer, vectorData: collection })
            if (JSON.stringify(breaks) !== JSON.stringify(item.style.breaks)) updateLayerStyle(item.dataset.id, { breaks })
          } else {
            const { default: parseGeoraster } = await import('georaster')
            const raster = await parseGeoraster((payload as ArrayBuffer).slice(0)) as unknown as BrowserRaster
            if (mapRef.current !== currentMap || !useAppStore.getState().layers.some((layer) => layer.dataset.id === item.dataset.id)) return
            if (!item.dataset.bounds) throw new Error('栅格数据缺少地图范围')
            const rendered = rasterPreviewImage(raster, item.style, item.dataset.statistics)
            const bounds = L.latLngBounds(
              [item.dataset.bounds.south, item.dataset.bounds.west],
              [item.dataset.bounds.north, item.dataset.bounds.east],
            )
            const rasterLayer = L.imageOverlay(rendered.url, bounds, {
              opacity: item.style.opacity,
              interactive: false,
            })
            if (item.visible) rasterLayer.addTo(currentMap)
            runtimeRef.current.set(item.dataset.id, { layer: rasterLayer, rasterLayer, rasterData: raster })
            if (JSON.stringify(rendered.breaks) !== JSON.stringify(item.style.breaks)) updateLayerStyle(item.dataset.id, { breaks: rendered.breaks })
          }
          setLayerRuntimeState(item.dataset.id, { loading: false, error: undefined })
          if (runtimeRef.current.size === 1 && item.dataset.bounds) {
            currentMap.fitBounds([[item.dataset.bounds.south, item.dataset.bounds.west], [item.dataset.bounds.north, item.dataset.bounds.east]], { padding: [48, 48] })
          }
        } catch (error) {
          setLayerRuntimeState(item.dataset.id, { loading: false, error: error instanceof Error ? error.message : '渲染失败' })
        } finally {
          loadingRef.current.delete(item.dataset.id)
        }
      })()
    }
  }, [layers, setLayerRuntimeState, updateLayerStyle])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layers.forEach((item, index) => {
      const runtime = runtimeRef.current.get(item.dataset.id)
      if (!runtime) return
      if (item.visible && !map.hasLayer(runtime.layer)) runtime.layer.addTo(map)
      if (!item.visible && map.hasLayer(runtime.layer)) runtime.layer.remove()
      if (runtime.vectorData) {
        const breaks = styleVector(runtime.layer as L.GeoJSON, runtime.vectorData, item.style)
        if (JSON.stringify(breaks) !== JSON.stringify(item.style.breaks)) updateLayerStyle(item.dataset.id, { breaks })
      } else if (runtime.rasterLayer && runtime.rasterData) {
        const rendered = rasterPreviewImage(runtime.rasterData, item.style, item.dataset.statistics)
        runtime.rasterLayer.setUrl(rendered.url)
        runtime.rasterLayer.setOpacity(item.style.opacity)
        runtime.rasterLayer.setZIndex(200 + layers.length - index)
        if (JSON.stringify(rendered.breaks) !== JSON.stringify(item.style.breaks)) updateLayerStyle(item.dataset.id, { breaks: rendered.breaks })
      }
    })
  }, [layers, updateLayerStyle])

    ;[...layers].reverse().forEach((item) => (runtimeRef.current.get(item.dataset.id)?.layer as L.GeoJSON | undefined)?.bringToFront?.())
return <div ref={containerRef} className="map-canvas" aria-label="京津冀空间数据地图" />
})
