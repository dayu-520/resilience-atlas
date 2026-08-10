import { useState } from 'react'
import { ArrowRight, Cloud, Database, Layers3, MapPinned, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import type { User } from '../types'

interface Props {
  onAuthenticated: (user: User) => void
  onLocal: () => void
}

export function AuthScreen({ onAuthenticated, onLocal }: Props) {
  const portfolioMode = import.meta.env.VITE_PORTFOLIO_MODE === 'true'
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('城市韧性工作室')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (register) {
        const result = await api.register({
          username,
          password,
          display_name: name,
          workspace_name: workspaceName,
        })
        if (result.status === 'pending') {
          setMessage(result.message)
          setRegister(false)
          setPassword('')
        } else {
          onAuthenticated(result.user)
        }
      } else {
        onAuthenticated(await api.login(username, password))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page">
    <section className="auth-hero">
      <div className="auth-brand"><span className="brand-mark"><i /><i /><i /></span><span>韧性云图</span></div>
      <div className="hero-copy">
        <span className="eyebrow">RESILIENCE ATLAS · STUDIO GIS</span>
        <h1>让工作室里的每一份<br /><em>空间数据真正流动起来</em></h1>
        <p>上传、共享、发现和可视化城市规划数据。无需反复传文件，也无需每次打开桌面 GIS。</p>
        <div className="feature-grid">
          <div><MapPinned /><b>区域发现</b><span>双击行政区，立即找到覆盖数据</span></div>
          <div><Layers3 /><b>地图工作台</b><span>矢量与栅格的专业制图控制</span></div>
          <div><Database /><b>统一资源库</b><span>Shapefile、GeoJSON、GeoTIFF</span></div>
          <div><ShieldCheck /><b>团队权限</b><span>所有者、编辑者、查看者三级角色</span></div>
        </div>
      </div>
      <div className="hero-map-lines" aria-hidden="true"><i /><i /><i /><i /></div>
    </section>
    <section className="auth-panel">
      {portfolioMode ? <div className="auth-card">
        <div className="auth-card-head"><span className="mini-logo"><Cloud /></span><div><h2>在线作品展示版</h2><p>无需注册，直接体验地图工作台</p></div></div>
        <p className="portfolio-note">这是用于作品集展示的纯前端版本。你可以在浏览器中上传 GeoJSON、Shapefile ZIP 或 GeoTIFF，体验数据管理、地图可视化和样式配置。</p>
        <button type="button" className="primary-button auth-submit" onClick={onLocal}>立即进入体验<ArrowRight size={17} /></button>
        <div className="local-entry portfolio-privacy"><Database size={17} /><span><b>数据隐私</b><small>上传内容只保存在当前浏览器，不会发送到服务器</small></span></div>
      </div> :
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head"><span className="mini-logo"><Cloud /></span><div><h2>{register ? '注册工作室账号' : '欢迎回来'}</h2><p>{register ? '创建新工作室，或申请加入已有工作室' : '登录工作室的共享地图'}</p></div></div>
        {register && <>
          <label>你的姓名<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="如何称呼你" /></label>
          <label>工作室名称<input required value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /><small className="field-help">名称已存在时不会重复创建，将向该工作室所有者提交加入申请。</small></label>
        </>}
        <label>用户名<input required minLength={2} maxLength={40} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如：zhangsan" /></label>
        <label>密码<input required minLength={8} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></label>
        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-success">{message}</div>}
        <button className="primary-button auth-submit" disabled={loading}>{loading ? '请稍候…' : register ? '注册或提交申请' : '登录工作台'}<ArrowRight size={17} /></button>
        <button type="button" className="text-button" onClick={() => { setRegister(!register); setError(''); setMessage('') }}>{register ? '已有账号？登录' : '第一次使用？注册账号'}</button>
        <div className="divider"><span>或</span></div>
        <button type="button" className="local-entry" onClick={onLocal}><Database size={17} /><span><b>进入本地工作台</b><small>数据只保存在这台浏览器，可离线使用</small></span><ArrowRight size={16} /></button>
      </form>}
      <p className="auth-footnote">{portfolioMode ? '作品展示版不含多人协作后端；完整系统支持工作室、角色权限与云端数据库。' : '工作室名称全平台唯一；加入已有工作室需由所有者审批。'}</p>
    </section>
  </main>
}
