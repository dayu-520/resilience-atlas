declare module "leaflet" {
  export type PathOptions = {
    color?: string;
    dashArray?: string;
    fillColor?: string;
    fillOpacity?: number;
    interactive?: boolean;
    opacity?: number;
    weight?: number;
  };

  export type LatLngExpression = [number, number];

  export type Map = {
    closePopup(): void;
    createPane(name: string): void;
    fitBounds(bounds: unknown, options?: { padding?: [number, number] }): void;
    getPane(name: string): { style: CSSStyleDeclaration } | undefined;
    off(eventName: string, handler: (event: any) => void): void;
    on(eventName: string, handler: (event: any) => void): void;
    remove(): void;
  };

  export type Layer = {
    addTo(map: Map | LayerGroup): Layer;
    bindTooltip(text: string, options?: { sticky?: boolean }): void;
    on(eventName: string, handler: () => void): void;
    removeFrom(map: Map): void;
  };

  export type GeoJSON<TProperties = Record<string, unknown>> = Layer & {
    addTo(map: Map | LayerGroup): GeoJSON<TProperties>;
    getBounds(): unknown;
  };

  export type LayerGroup = {
    addTo(map: Map): LayerGroup;
    removeFrom(map: Map): void;
  };

  export type Popup = {
    openOn(map: Map): void;
    setContent(content: string): Popup;
    setLatLng(latLng: LatLngExpression): Popup;
  };

  export function map(
    element: HTMLElement,
    options: { center: LatLngExpression; zoom: number; zoomControl: boolean },
  ): Map;

  export function tileLayer(
    url: string,
    options: { attribution: string; maxZoom: number; subdomains?: string[] },
  ): Layer;

  export function layerGroup(): LayerGroup;

  export function geoJSON<TProperties>(
    data: unknown,
    options: {
      pane?: string;
      style?: PathOptions | ((feature?: { properties: TProperties }) => PathOptions);
      onEachFeature?: (feature: unknown, layer: Layer) => void;
    },
  ): GeoJSON<TProperties>;

  export function popup(options?: { closeButton?: boolean }): Popup;
}
