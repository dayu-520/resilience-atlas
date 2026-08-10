import { create } from 'zustand'
import type { DataMode, Dataset, IdentifyResult, LayerStyle, LoadedLayer, User, Workspace } from './types'

export function defaultStyle(dataset: Dataset): LayerStyle {
  const numeric = dataset.fields.find((field) => field.type === 'number')?.name || null
  const stats = dataset.statistics || {}
  const min = Number((stats as { min?: number }).min ?? 0)
  const max = Number((stats as { max?: number }).max ?? 100)
  return {
    opacity: 0.9,
    field: numeric,
    rampName: dataset.type === 'raster' ? 'Viridis' : 'Blues',
    classes: 5,
    singleColor: '#2f7df4',
    outlineColor: '#e2e8f0',
    weight: 2.5,
    radius: 6,
    rasterMode: 'classified',
    classify: 'quantile',
    manualBreaks: '',
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 100,
    breaks: [],
    ...dataset.style,
  }
}

interface AppState {
  user: User | null
  workspaces: Workspace[]
  workspace: Workspace | null
  mode: DataMode
  datasets: Dataset[]
  layers: LoadedLayer[]
  activeLayerId: string | null
  activePanel: 'layers' | 'data' | 'style' | 'team' | 'settings' | null
  identify: IdentifyResult | null
  busy: string | null
  notice: { type: 'success' | 'error' | 'info'; message: string } | null
  setUser: (user: User | null) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setWorkspace: (workspace: Workspace | null) => void
  setMode: (mode: DataMode) => void
  setDatasets: (datasets: Dataset[]) => void
  upsertDataset: (dataset: Dataset) => void
  removeDataset: (id: string) => void
  loadLayer: (dataset: Dataset) => void
  unloadLayer: (id: string) => void
  clearLayers: () => void
  toggleLayer: (id: string) => void
  reorderLayer: (id: string, direction: -1 | 1) => void
  updateLayerStyle: (id: string, patch: Partial<LayerStyle>) => void
  setLayerRuntimeState: (id: string, patch: Partial<Pick<LoadedLayer, 'loading' | 'error'>>) => void
  setActiveLayer: (id: string | null) => void
  setPanel: (panel: AppState['activePanel']) => void
  setIdentify: (result: IdentifyResult | null) => void
  setBusy: (busy: string | null) => void
  notify: (notice: AppState['notice']) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  workspaces: [],
  workspace: null,
  mode: 'shared',
  datasets: [],
  layers: [],
  activeLayerId: null,
  activePanel: 'layers',
  identify: null,
  busy: null,
  notice: null,
  setUser: (user) => set({ user }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setWorkspace: (workspace) => set({ workspace, datasets: [], layers: [], activeLayerId: null }),
  setMode: (mode) => set({ mode, datasets: [], layers: [], activeLayerId: null, identify: null }),
  setDatasets: (datasets) => set({ datasets }),
  upsertDataset: (dataset) => set((state) => ({ datasets: [dataset, ...state.datasets.filter((item) => item.id !== dataset.id)] })),
  removeDataset: (id) => set((state) => ({ datasets: state.datasets.filter((item) => item.id !== id), layers: state.layers.filter((item) => item.dataset.id !== id) })),
  loadLayer: (dataset) => set((state) => state.layers.some((layer) => layer.dataset.id === dataset.id) ? { activeLayerId: dataset.id, activePanel: 'style' } : { layers: [{ dataset, style: defaultStyle(dataset), visible: true, loading: true }, ...state.layers], activeLayerId: dataset.id, activePanel: 'style' }),
  unloadLayer: (id) => set((state) => ({ layers: state.layers.filter((layer) => layer.dataset.id !== id), activeLayerId: state.activeLayerId === id ? null : state.activeLayerId })),
  clearLayers: () => set({ layers: [], activeLayerId: null }),
  toggleLayer: (id) => set((state) => ({ layers: state.layers.map((layer) => layer.dataset.id === id ? { ...layer, visible: !layer.visible } : layer) })),
  reorderLayer: (id, direction) => set((state) => {
    const layers = [...state.layers]
    const index = layers.findIndex((layer) => layer.dataset.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= layers.length) return state
    ;[layers[index], layers[target]] = [layers[target], layers[index]]
    return { layers }
  }),
  updateLayerStyle: (id, patch) => set((state) => ({ layers: state.layers.map((layer) => layer.dataset.id === id ? { ...layer, style: { ...layer.style, ...patch } } : layer) })),
  setLayerRuntimeState: (id, patch) => set((state) => ({ layers: state.layers.map((layer) => layer.dataset.id === id ? { ...layer, ...patch } : layer) })),
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  setPanel: (activePanel) => set({ activePanel }),
  setIdentify: (identify) => set({ identify }),
  setBusy: (busy) => set({ busy }),
  notify: (notice) => set({ notice }),
}))

