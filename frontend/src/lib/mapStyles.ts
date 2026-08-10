import type { FeatureCollection } from 'geojson'
import L from 'leaflet'
import type { LayerStyle } from '../types'
import { equalBreaks, manualBreaks, quantileBreaks, ramp } from './ramps'

export interface BrowserRaster {
  width: number
  height: number
  noDataValue?: number
  values: Array<ArrayLike<ArrayLike<number>>>
}

export function geometryKind(collection: FeatureCollection) {
  const type = collection.features.find((feature) => feature.geometry)?.geometry?.type || 'Polygon'
  if (type.includes('Line')) return 'line'
  if (type.includes('Point')) return 'point'
  return 'polygon'
}

export function styleVector(layer: L.GeoJSON, collection: FeatureCollection, style: LayerStyle) {
  const kind = geometryKind(collection)
  const values = style.field ? collection.features.map((feature) => Number(feature.properties?.[style.field!])).filter(Number.isFinite) : []
  const breaks = values.length ? quantileBreaks(values, style.classes) : []
  const scale = ramp(style.rampName)
  const paint = (value: number | null) => {
    if (value == null || !breaks.length) return style.singleColor
    let index = breaks.findIndex((boundary) => value <= boundary)
    if (index < 0) index = breaks.length - 1
    return scale(index / Math.max(1, style.classes - 1)).hex()
  }
  layer.setStyle((feature) => {
    const raw = style.field ? Number(feature?.properties?.[style.field]) : null
    const color = paint(Number.isFinite(raw) ? raw : null)
    if (kind === 'line') return { color, weight: style.weight, opacity: style.opacity }
    return { color: style.outlineColor, weight: 1, opacity: style.opacity, fillColor: color, fillOpacity: style.opacity }
  })
  layer.eachLayer((child) => {
    if (child instanceof L.CircleMarker) child.setRadius(style.radius)
  })
  return breaks
}

export function rasterBreaks(style: LayerStyle, statistics: Record<string, unknown>) {
  if (style.classify === 'manual') {
    const parsed = manualBreaks(style.manualBreaks, style.classes)
    if (parsed.length) return parsed
  }
  if (style.classify === 'quantile') {
    const values = (statistics.quantiles as number[] | undefined) || []
    if (values.length) return quantileBreaks(values, style.classes, style.min, style.max)
  }
  return equalBreaks(style.min, style.max, style.classes)
}

export function rasterPreviewImage(
  raster: BrowserRaster,
  style: LayerStyle,
  statistics: Record<string, unknown>,
) {
  const breaks = rasterBreaks(style, statistics)
  const maxCanvasDimension = 1200
  const ratio = Math.min(1, maxCanvasDimension / Math.max(raster.width, raster.height))
  const width = Math.max(1, Math.round(raster.width * ratio))
  const height = Math.max(1, Math.round(raster.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建栅格绘图画布')
  const image = context.createImageData(width, height)
  const scale = ramp(style.rampName)
  const continuousColors = Array.from({ length: 512 }, (_, index) => scale(index / 511).rgb())
  const classColors = breaks.map((_, index) => scale(index / Math.max(1, breaks.length - 1)).rgb())
  const band = raster.values[0]
  const valueRange = Math.max(Number.EPSILON, style.max - style.min)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(raster.height - 1, Math.floor(y / ratio))
    const row = band[sourceY]
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(raster.width - 1, Math.floor(x / ratio))
      const value = Number(row[sourceX])
      const offset = (y * width + x) * 4
      if (!Number.isFinite(value) || value === raster.noDataValue || value < style.min || value > style.max) {
        image.data[offset + 3] = 0
        continue
      }
      let color: number[]
      if (style.rasterMode === 'continuous') {
        const colorIndex = Math.max(0, Math.min(511, Math.round(((value - style.min) / valueRange) * 511)))
        color = continuousColors[colorIndex]
      } else {
        let classIndex = breaks.findIndex((boundary) => value <= boundary)
        if (classIndex < 0) classIndex = Math.max(0, breaks.length - 1)
        color = classColors[classIndex] || continuousColors[0]
      }
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return { url: canvas.toDataURL('image/png'), breaks }
}