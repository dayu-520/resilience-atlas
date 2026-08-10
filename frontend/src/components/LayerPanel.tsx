import { ChevronDown, ChevronUp, Download, Eye, EyeOff, Focus, Layers3, LoaderCircle, Palette, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { localRepository } from '../lib/localRepository'
import { useAppStore } from '../store'
import type { Dataset } from '../types'
interface Props { onZoom: (dataset: Dataset) => void }
export function LayerPanel({ onZoom }: Props) {
  const layers = useAppStore((state) => state.layers), toggleLayer = useAppStore((state) => state.toggleLayer), unloadLayer = useAppStore((state) => state.unloadLayer), clearLayers = useAppStore((state) => state.clearLayers), reorderLayer = useAppStore((state) => state.reorderLayer), setActiveLayer = useAppStore((state) => state.setActiveLayer), setPanel = useAppStore((state) => state.setPanel), notify = useAppStore((state) => state.notify)
  async function download(dataset: Dataset) {
    try {
      if (dataset.local) await localRepository.download(dataset.id)
      else await api.download(dataset.id, dataset.source_filename)
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '下载失败' })
    }
  }
  return <div className="panel-body layer-panel-body">
    <div className="section-heading"><div><h3>地图图层</h3><span>上方图层优先显示 · {layers.length} 个</span></div>{layers.length > 0 && <button className="text-danger" onClick={() => window.confirm('移除地图中的全部图层？数据资源不会被删除。') && clearLayers()}>全部移除</button>}</div>
    {!layers.length && <div className="empty-state large"><Layers3 /><b>地图还是空的</b><span>到“数据”面板加载需要查看的数据集</span><button className="small-button" onClick={() => setPanel('data')}>打开数据资源库</button></div>}
    <div className="loaded-layer-list">{layers.map((item, index) => <article className={`loaded-layer ${item.error ? 'has-error' : ''}`} key={item.dataset.id} onClick={() => { setActiveLayer(item.dataset.id); setPanel('style') }}><div className={`layer-swatch ${item.dataset.type}`} style={{ opacity: item.style.opacity, background: item.dataset.type === 'vector' ? item.style.singleColor : undefined }} /><div className="layer-main"><div><b>{item.dataset.name}</b>{item.loading && <LoaderCircle size={13} className="spin" />}</div><span>{item.dataset.type === 'raster' ? '栅格' : item.dataset.geometry_type || '矢量'} · 透明度 {Math.round(item.style.opacity * 100)}%</span>{item.error && <em>{item.error}</em>}</div><div className="layer-quick" onClick={(event) => event.stopPropagation()}><button title={item.visible ? '隐藏' : '显示'} onClick={() => toggleLayer(item.dataset.id)}>{item.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button><button title="制图样式" onClick={() => { setActiveLayer(item.dataset.id); setPanel('style') }}><Palette size={16} /></button><button title="定位" onClick={() => onZoom(item.dataset)}><Focus size={16} /></button></div><div className="layer-more" onClick={(event) => event.stopPropagation()}><button disabled={index === 0} title="上移" onClick={() => reorderLayer(item.dataset.id, -1)}><ChevronUp size={15} /></button><button disabled={index === layers.length - 1} title="下移" onClick={() => reorderLayer(item.dataset.id, 1)}><ChevronDown size={15} /></button><button title="下载源文件" onClick={() => void download(item.dataset)}><Download size={15} /></button><button title="从地图移除" className="danger-icon" onClick={() => unloadLayer(item.dataset.id)}><Trash2 size={15} /></button></div></article>)}</div>
    {!!layers.length && <div className="panel-hint"><Eye size={14} />点击图层卡片进入制图面板。移除图层不会删除资源库中的数据。</div>}
  </div>
}
