import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, BarChart3, Building2, CheckCircle2, ChevronDown, ChevronRight, Database, LogOut, RefreshCw, Search, Trash2, UserRoundCog, Users } from 'lucide-react'
import { api, authToken } from '../lib/api'
import { useAppStore } from '../store'
import type { AdminDataset, AdminOverview, AdminUser, AdminWorkspace, User, WorkspaceRole } from '../types'

type AdminTab = 'overview' | 'accounts' | 'workspaces' | 'datasets'
type Member = User & { role: WorkspaceRole }

const emptyOverview: AdminOverview = { user_count: 0, active_user_count: 0, blocked_user_count: 0, workspace_count: 0, dataset_count: 0, storage_bytes: 0 }

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function PlatformAdminDashboard({ onExit }: { onExit: () => void }) {
  const currentUser = useAppStore((state) => state.user)
  const notify = useAppStore((state) => state.notify)
  const notice = useAppStore((state) => state.notice)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [overview, setOverview] = useState(emptyOverview)
  const [accounts, setAccounts] = useState<AdminUser[]>([])
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([])
  const [datasets, setDatasets] = useState<AdminDataset[]>([])
  const [members, setMembers] = useState<Record<string, Member[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [summary, userList, workspaceList, datasetList] = await Promise.all([
        api.adminOverview(), api.adminUsers(), api.adminWorkspaces(), api.adminDatasets(),
      ])
      setOverview(summary)
      setAccounts(userList)
      setWorkspaces(workspaceList)
      setDatasets(datasetList)
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '平台数据读取失败' })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => notify(null), 3600); return () => clearTimeout(timer) }, [notice, notify])

  async function toggleAccount(account: AdminUser) {
    const verb = account.is_blocked ? '恢复' : '停用'
    if (!window.confirm(`确定${verb}账号“${account.username}”吗？`)) return
    setChanging(account.id)
    try {
      const updated = await api.setUserBlocked(account.id, !account.is_blocked)
      setAccounts((items) => items.map((item) => item.id === updated.id ? updated : item))
      setOverview((value) => ({ ...value, blocked_user_count: value.blocked_user_count + (updated.is_blocked ? 1 : -1), active_user_count: value.active_user_count + (updated.is_blocked ? -1 : 1) }))
      notify({ type: 'success', message: `已${verb}账号 ${account.username}` })
    } catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : `${verb}失败` }) }
    finally { setChanging(null) }
  }

  async function deleteAccount(account: AdminUser) {
    if (!window.confirm(`确定永久删除账号“${account.username}”吗？\n\n共享数据会保留并转交工作室管理员；如果该账号仍是工作室管理员，需要先转移权限。`)) return
    setChanging(account.id)
    try {
      await api.deleteAdminUser(account.id)
      await refresh()
      notify({ type: 'success', message: `账号 ${account.username} 已删除` })
    } catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '删除失败' }) }
    finally { setChanging(null) }
  }

  async function toggleWorkspace(workspaceId: string) {
    if (expanded === workspaceId) { setExpanded(null); return }
    setExpanded(workspaceId)
    if (!members[workspaceId]) {
      try { const workspaceMembers = await api.adminWorkspaceMembers(workspaceId); setMembers((value) => ({ ...value, [workspaceId]: workspaceMembers })) }
      catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '成员读取失败' }) }
    }
  }

  async function removeMember(workspace: AdminWorkspace, member: Member) {
    if (!window.confirm(`确定将“${member.display_name}”移出“${workspace.name}”吗？`)) return
    setChanging(member.id)
    try {
      await api.removeAdminWorkspaceMember(workspace.id, member.id)
      setMembers((value) => ({ ...value, [workspace.id]: value[workspace.id].filter((item) => item.id !== member.id) }))
      setWorkspaces((items) => items.map((item) => item.id === workspace.id ? { ...item, member_count: item.member_count - 1 } : item))
      notify({ type: 'success', message: '成员已移出工作室' })
    } catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '移除失败' }) }
    finally { setChanging(null) }
  }

  async function transferOwner(workspace: AdminWorkspace, member: Member) {
    if (!window.confirm(`确定将“${workspace.name}”的管理员权限转移给“${member.display_name}”吗？\n原管理员将变为编辑者。`)) return
    setChanging(member.id)
    try {
      const updated = await api.transferAdminWorkspaceOwner(workspace.id, member.id)
      setMembers((value) => ({ ...value, [workspace.id]: updated }))
      setWorkspaces((items) => items.map((item) => item.id === workspace.id ? { ...item, owner_id: member.id, owner_name: member.display_name, owner_username: member.username } : item))
      notify({ type: 'success', message: '工作室管理员权限已转移' })
    } catch (error) { notify({ type: 'error', message: error instanceof Error ? error.message : '转移失败' }) }
    finally { setChanging(null) }
  }

  function exit() { authToken.clear(); onExit() }
  const keyword = query.trim().toLocaleLowerCase()
  const filteredAccounts = useMemo(() => accounts.filter((item) => !keyword || `${item.display_name} ${item.username}`.toLocaleLowerCase().includes(keyword)), [accounts, keyword])
  const filteredWorkspaces = useMemo(() => workspaces.filter((item) => !keyword || `${item.name} ${item.slug} ${item.owner_name} ${item.owner_username}`.toLocaleLowerCase().includes(keyword)), [workspaces, keyword])
  const filteredDatasets = useMemo(() => datasets.filter((item) => !keyword || `${item.name} ${item.source_filename} ${item.workspace_name} ${item.owner_name}`.toLocaleLowerCase().includes(keyword)), [datasets, keyword])

  const tabs: Array<{ key: AdminTab; label: string; icon: typeof BarChart3; count?: number }> = [
    { key: 'overview', label: '平台概览', icon: BarChart3 },
    { key: 'accounts', label: '账号管理', icon: Users, count: overview.user_count },
    { key: 'workspaces', label: '工作室管理', icon: Building2, count: overview.workspace_count },
    { key: 'datasets', label: '数据清单', icon: Database, count: overview.dataset_count },
  ]

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="brand-mark small"><i /><i /><i /></span><span><b>韧性云图</b><small>平台管理中心</small></span></div>
      <nav>{tabs.map((item) => { const Icon = item.icon; return <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => { setTab(item.key); setQuery('') }}><Icon /><span>{item.label}</span>{item.count !== undefined && <em>{item.count}</em>}</button> })}</nav>
      <div className="admin-identity"><span>{currentUser?.display_name.slice(0, 1).toUpperCase()}</span><div><b>{currentUser?.display_name}</b><small>平台管理员</small></div><button title="退出登录" onClick={exit}><LogOut /></button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><h1>{tabs.find((item) => item.key === tab)?.label}</h1><p>{tab === 'overview' ? '全平台运行与资源使用情况' : tab === 'accounts' ? '管理平台注册账号及访问状态' : tab === 'workspaces' ? '查看工作室并维护成员与管理员权限' : '查看每个工作室上传的数据与存储占用'}</p></div><div className="admin-top-actions">{tab !== 'overview' && <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" /></label>}<button onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />刷新</button></div></header>

      {tab === 'overview' && <div className="admin-overview">
        <section className="admin-metrics"><article><span><Users /></span><div><small>平台注册账号</small><b>{overview.user_count}</b><em>{overview.active_user_count} 个正常使用</em></div></article><article><span><Building2 /></span><div><small>工作室</small><b>{overview.workspace_count}</b><em>独立权限空间</em></div></article><article><span><Database /></span><div><small>数据总量</small><b>{overview.dataset_count}</b><em>{formatBytes(overview.storage_bytes)}</em></div></article><article><span><Ban /></span><div><small>已停用账号</small><b>{overview.blocked_user_count}</b><em>不能访问云端数据</em></div></article></section>
        <section className="admin-overview-grid"><article><header><Building2 /><b>工作室使用排行</b></header>{workspaces.slice().sort((a, b) => b.storage_bytes - a.storage_bytes).slice(0, 6).map((item) => <div className="overview-row" key={item.id}><span><b>{item.name}</b><small>{item.member_count} 位成员 · {item.dataset_count} 份数据</small></span><em>{formatBytes(item.storage_bytes)}</em></div>)}</article><article><header><Database /><b>最近上传</b></header>{datasets.slice(0, 6).map((item) => <div className="overview-row" key={item.id}><span><b>{item.name}</b><small>{item.workspace_name} · {item.owner_name}</small></span><em>{formatBytes(item.size_bytes)}</em></div>)}</article></section>
      </div>}

      {tab === 'accounts' && <section className="admin-table-card"><table><thead><tr><th>账号</th><th>工作空间</th><th>注册时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{filteredAccounts.map((account) => <tr key={account.id}><td><div className="admin-person"><span>{account.display_name.slice(0, 1).toUpperCase()}</span><div><b>{account.display_name}{account.is_admin && <em>平台管理员</em>}</b><small>@{account.username}</small></div></div></td><td>{account.workspace_count} 个</td><td>{new Date(account.created_at).toLocaleDateString('zh-CN')}</td><td><span className={`admin-status ${account.is_blocked ? 'blocked' : 'active'}`}>{account.is_blocked ? <Ban /> : <CheckCircle2 />}{account.is_blocked ? '已停用' : '正常'}</span></td><td><div className="row-actions"><button disabled={changing === account.id || account.is_admin} onClick={() => void toggleAccount(account)}>{account.is_blocked ? '恢复' : '停用'}</button><button className="danger" disabled={changing === account.id || account.is_admin} onClick={() => void deleteAccount(account)}><Trash2 />删除</button></div></td></tr>)}</tbody></table>{!filteredAccounts.length && <div className="admin-empty">没有匹配的账号</div>}</section>}

      {tab === 'workspaces' && <section className="workspace-admin-list">{filteredWorkspaces.map((workspace) => <article key={workspace.id} className="workspace-admin-card"><button className="workspace-summary" onClick={() => void toggleWorkspace(workspace.id)}>{expanded === workspace.id ? <ChevronDown /> : <ChevronRight />}<span className="workspace-admin-icon"><Building2 /></span><div><b>{workspace.name}</b><small>/{workspace.slug} · 创建于 {new Date(workspace.created_at).toLocaleDateString('zh-CN')}</small></div><span><small>管理员</small><b>{workspace.owner_name}</b></span><span><small>成员</small><b>{workspace.member_count}</b></span><span><small>数据</small><b>{workspace.dataset_count}</b></span><span><small>存储</small><b>{formatBytes(workspace.storage_bytes)}</b></span></button>{expanded === workspace.id && <div className="workspace-members"><header><b>工作室成员</b><small>可移除普通成员，或将管理员权限转移给其他成员</small></header>{!members[workspace.id] ? <div className="admin-empty">正在读取成员…</div> : members[workspace.id].map((member) => <div className="workspace-member" key={member.id}><div className="admin-person"><span>{member.display_name.slice(0, 1).toUpperCase()}</span><div><b>{member.display_name}</b><small>@{member.username}</small></div></div><span className={`member-role ${member.role}`}>{member.role === 'owner' ? '管理员' : member.role === 'editor' ? '编辑者' : '查看者'}</span><div className="row-actions">{member.role !== 'owner' && <><button disabled={changing === member.id} onClick={() => void transferOwner(workspace, member)}><UserRoundCog />转为管理员</button><button className="danger" disabled={changing === member.id} onClick={() => void removeMember(workspace, member)}><Trash2 />移出</button></>}</div></div>)}</div>}</article>)}{!filteredWorkspaces.length && <div className="admin-empty">没有匹配的工作室</div>}</section>}

      {tab === 'datasets' && <section className="admin-table-card"><table><thead><tr><th>数据</th><th>工作室</th><th>上传者</th><th>类型</th><th>大小</th><th>上传时间</th></tr></thead><tbody>{filteredDatasets.map((dataset) => <tr key={dataset.id}><td><div className="dataset-admin-name"><span><Database /></span><div><b>{dataset.name}</b><small>{dataset.source_filename}</small></div></div></td><td>{dataset.workspace_name}</td><td>{dataset.owner_name}</td><td><span className="type-chip">{dataset.type === 'raster' ? '栅格' : '矢量'}</span></td><td>{formatBytes(dataset.size_bytes)}</td><td>{new Date(dataset.created_at).toLocaleString('zh-CN')}</td></tr>)}</tbody></table>{!filteredDatasets.length && <div className="admin-empty">没有匹配的数据</div>}</section>}
    </main>
    {notice && <div className={`toast ${notice.type}`}><span>{notice.message}</span></div>}
  </div>
}