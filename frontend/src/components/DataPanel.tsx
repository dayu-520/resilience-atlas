import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cloud, Database, Download, FileArchive, FileImage, LoaderCircle, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react'
import { api } from '../lib/api'
import { localRepository } from '../lib/localRepository'
import { useAppStore } from '../store'
import type { Dataset } from '../types'

interface PendingFile { file: File; name: string; epsg: string }
function sizeLabel(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }

export function DataPanel() {
  const mode = useAppStore((state) => state.mode), workspace = useAppStore((state) => state.workspace)
  const datasets = useAppStore((state) => state.datasets), layers = useAppStore((state) => state.layers)
  const setMode = useAppStore((state) => state.setMode), setDatasets = useAppStore((state) => state.setDatasets)
  const loadLayer = useAppStore((state) => state.loadLayer), removeDatasetState = useAppStore((state) => state.removeDataset)
  const setBusy = useAppStore((state) => state.setBusy), notify = useAppStore((state) => state.notify)
  const [query, setQuery] = useState(''), [pending, setPending] = useState<PendingFile[]>([]), [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null), editable = mode === 'local' || workspace?.role !== 'viewer'

  const refresh = useCallback(async () => {
    try { setDatasets(mode === 'local' ? await localRepository.list() : workspace ? await api.datasets(workspace.id, query) : []) }
    catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '无法读取数据资源库' }) }
  }, [mode, notify, query, setDatasets, workspace])
  useEffect(() => { void refresh() }, [refresh])
  const filtered = useMemo(() => mode === 'shared' ? datasets : datasets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [datasets, mode, query])
  function choose(files: FileList | File[]) {
    const accepted = Array.from(files).filter((file) => /\.(zip|json|geojson|tif|tiff)$/i.test(file.name))
    if (!accepted.length) return notify({ type: 'error', message: '请选择 ZIP、GeoJSON 或 GeoTIFF 文件' })
    setPending(accepted.map((file) => ({ file, name: file.name.replace(/\.[^.]+$/, ''), epsg: '' })))
  }
  async function uploadAll() {
    if (!pending.length || (mode === 'shared' && !workspace)) return
    let succeeded = 0; setBusy(`正在处理 1 / ${pending.length}`)
    for (let index = 0; index < pending.length; index++) {
      const item = pending[index]; setBusy(`正在处理 ${index + 1} / ${pending.length} · ${item.name}`)
      try {
        if (mode === 'local') await localRepository.ingest(item.file, item.name, item.epsg)
        else await api.upload(workspace!.id, item.file, item.name, item.epsg)
        succeeded++
      }
      catch (error) { notify({ type: 'error', message: `${item.file.name}：${error instanceof Error ? error.message : '处理失败'}` }) }
    }
    setBusy(null); setPending([]); await refresh(); if (succeeded) notify({ type: 'success', message: `已入库 ${succeeded} 个数据集` })
  }
  async function remove(dataset: Dataset) {
    if (!window.confirm(`确定删除“${dataset.name}”吗？源文件也会被删除。`)) return
    try {
      if (dataset.local) await localRepository.remove(dataset.id)
      else await api.deleteDataset(dataset.id)
      removeDatasetState(dataset.id); notify({ type: 'success', message: '数据集已删除' })
    }
    catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '删除失败' }) }
  }
  async function download(dataset: Dataset) {
    try {
      if (dataset.local) await localRepository.download(dataset.id)
      else await api.download(dataset.id, dataset.source_filename)
    }
    catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '下载失败' }) }
  }

  return <div className="panel-body data-panel">
    <section className="mode-switcher"><button className={mode === 'shared' ? 'active' : ''} onClick={() => setMode('shared')} disabled={!workspace}><Cloud size={16} /><span><b>团队云端</b><small>{workspace?.name || '需要登录'}</small></span></button><button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}><Database size={16} /><span><b>浏览器本地</b><small>仅当前设备可见</small></span></button></section>
    {editable && <section className={`upload-zone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files) }}><input ref={inputRef} hidden type="file" multiple accept=".zip,.json,.geojson,.tif,.tiff" onChange={(event) => event.target.files && choose(event.target.files)} /><span className="upload-icon"><UploadCloud /></span><div><b>拖放或选择空间数据</b><p>Shapefile ZIP · GeoJSON · GeoTIFF，支持批量上传</p></div><button className="small-button"><Plus size={15} />选择文件</button></section>}
    {!editable && <div className="read-only-note">你是查看者，可以浏览、制图和下载，但不能上传或删除共享数据。</div>}
    <div className="section-heading"><div><h3>数据资源库</h3><span>{filtered.length} 个数据集</span></div><div className="search-box"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void refresh()} placeholder="搜索名称" /></div></div>
    <div className="dataset-list">{!filtered.length && <div className="empty-state"><Database /><b>还没有数据</b><span>{editable ? '从上方上传第一份空间数据' : '等待工作室成员上传数据'}</span></div>}{filtered.map((dataset) => { const loaded = layers.some((item) => item.dataset.id === dataset.id); return <article className="dataset-card" key={dataset.id}><span className={`file-kind ${dataset.type}`}>{dataset.type === 'raster' ? <FileImage /> : <FileArchive />}</span><div className="dataset-info"><div className="dataset-title"><b title={dataset.name}>{dataset.name}</b><span>{dataset.local ? '本地' : dataset.owner_name || '团队'}</span></div><p>{dataset.geometry_type || (dataset.type === 'raster' ? '栅格数据' : '矢量数据')} · {dataset.feature_count != null ? `${dataset.feature_count.toLocaleString()} 要素 · ` : ''}{sizeLabel(dataset.size_bytes)}</p><small>{dataset.source_crs || '坐标系未记录'} · {new Date(dataset.created_at).toLocaleDateString('zh-CN')}</small>{dataset.status === 'failed' && <em>{dataset.error_message}</em>}</div><div className="dataset-actions"><button className="load-button" disabled={loaded || dataset.status !== 'ready'} onClick={() => loadLayer(dataset)}>{loaded ? '已加载' : dataset.status === 'processing' ? <LoaderCircle className="spin" size={15} /> : '加载'}</button><button title="下载源文件" onClick={() => void download(dataset)}><Download size={15} /></button>{editable && <button className="danger-icon" title="删除" onClick={() => void remove(dataset)}><Trash2 size={15} /></button>}</div></article> })}</div>
    {pending.length > 0 && createPortal(<div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPending([])}><section className="upload-modal"><header><div><span>批量入库</span><h2>确认名称与坐标系</h2></div><button onClick={() => setPending([])}><X /></button></header><div className="projection-tip">只有文件缺少或写错坐标系时才填写 EPSG。常见：WGS84 为 4326，北京 2000 高斯投影可能为 4547。</div><div className="pending-list">{pending.map((item, index) => <div className="pending-row" key={`${item.file.name}-${index}`}><span className="extension">{item.file.name.split('.').pop()?.toUpperCase()}</span><label><small>数据名称</small><input value={item.name} onChange={(event) => setPending((current) => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label className="epsg-field"><small>EPSG（可选）</small><input value={item.epsg} onChange={(event) => setPending((current) => current.map((entry, i) => i === index ? { ...entry, epsg: event.target.value.replace(/\D/g, '') } : entry))} placeholder="自动识别" /></label></div>)}</div><footer><span>共 {pending.length} 个文件</span><div><button className="secondary-button" onClick={() => setPending([])}>取消</button><button className="primary-button" onClick={() => void uploadAll()}><UploadCloud size={16} />确认入库</button></div></footer></section></div>, document.body)}
  </div>
}
