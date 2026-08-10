import { Building2, Check, Database, MapPin, X } from 'lucide-react'
import { useAppStore } from '../store'
export function IdentifyCard() {
  const result = useAppStore((state) => state.identify)
  const layers = useAppStore((state) => state.layers)
  const loadLayer = useAppStore((state) => state.loadLayer)
  const setIdentify = useAppStore((state) => state.setIdentify)
  if (!result) return null
  return <aside className="identify-card"><header><span><MapPin /></span><div><small>空间识别</small><h3>{result.region ? `${result.region.parent ? `${result.region.parent} / ` : ''}${result.region.name}` : '当前位置'}</h3><p>{result.point.lng.toFixed(5)}, {result.point.lat.toFixed(5)}</p></div><button onClick={() => setIdentify(null)}><X /></button></header><div className="identify-summary"><Building2 /><span><b>{result.datasets.length}</b> 个数据集覆盖所选区域</span></div><div className="identify-list">{!result.datasets.length && <div className="identify-empty"><Database /><span>该区域暂时没有可用数据</span></div>}{result.datasets.map((dataset) => { const loaded = layers.some((layer) => layer.dataset.id === dataset.id); return <article key={dataset.id}><span className={`mini-kind ${dataset.type}`} /><div><b>{dataset.name}</b><small>{dataset.type === 'raster' ? '栅格数据' : dataset.geometry_type || '矢量数据'}</small></div><button disabled={loaded} onClick={() => loadLayer(dataset)}>{loaded ? <><Check />已加载</> : '加载'}</button></article> })}</div><footer>右键地图可清除当前选择</footer></aside>
}
