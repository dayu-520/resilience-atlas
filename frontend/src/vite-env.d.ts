/// <reference types="vite/client" />

declare module 'georaster' {
  export default function parseGeoraster(input: ArrayBuffer): Promise<GeoRaster>
  export interface GeoRaster {
    xmin: number
    xmax: number
    ymin: number
    ymax: number
    mins?: number[]
    maxs?: number[]
    noDataValue?: number
    values?: number[][]
    projection?: number | string
    [key: string]: unknown
  }
}

declare module 'georaster-layer-for-leaflet' {
  import type { GridLayer, GridLayerOptions, LatLngBounds } from 'leaflet'
  import type { GeoRaster } from 'georaster'
  export default class GeoRasterLayer extends GridLayer {
    constructor(options: GridLayerOptions & { georaster: GeoRaster; resolution?: number; pixelValuesToColorFn?: (values: number[]) => string | null })
    updateColors(callback: (values: number[]) => string | null): void
    getBounds(): LatLngBounds
    setOpacity(opacity: number): this
    setZIndex(zIndex: number): this
  }
}

declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'
  export default function shp(input: ArrayBuffer): Promise<FeatureCollection | FeatureCollection[]>
}

