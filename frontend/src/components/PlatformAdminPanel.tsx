import { useCallback, useEffect, useState } from 'react'
import { Ban, CircleCheck, RefreshCw, ShieldCheck, UserCog } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store'
import type { AdminUser } from '../types'

export function PlatformAdminPanel() {
  const notify = useAppStore((state) => state.notify)
  const currentUser = useAppStore((state) => state.user)
  const [accounts, setAccounts] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setAccounts(await api.adminUsers())
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '账号列表读取失败' })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void refresh() }, [refresh])

  async function toggle(account: AdminUser) {
    const action = account.is_blocked ? '恢复' : '停用'
    if (!window.confirm(`确定${action}账号“${account.username}”吗？`)) return
    setChanging(account.id)
    try {
      const updated = await api.setUserBlocked(account.id, !account.is_blocked)
      setAccounts((items) => items.map((item) => item.id === updated.id ? updated : item))
      notify({ type: 'success', message: `已${action}账号 ${account.username}` })
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : `${action}失败` })
    } finally {
      setChanging(null)
    }
  }

  return <section className="platform-admin-card">
    <header>
      <div><UserCog /><span><b>平台注册账号</b><small>仅平台管理员可见 · {accounts.length} 个账号</small></span></div>
      <button type="button" title="刷新账号列表" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} /></button>
    </header>
    <div className="platform-account-list">
      {accounts.map((account) => <article className={account.is_blocked ? 'blocked' : ''} key={account.id}>
        <span className="avatar">{account.display_name.slice(0, 1).toUpperCase()}</span>
        <div><b>{account.display_name}{account.is_admin && <em>平台管理员</em>}</b><span>{account.username}</span><small>{account.workspace_count} 个工作空间 · {new Date(account.created_at).toLocaleDateString('zh-CN')}</small></div>
        <span className={`account-status ${account.is_blocked ? 'blocked' : 'active'}`}>{account.is_blocked ? <Ban /> : <CircleCheck />}{account.is_blocked ? '已停用' : '正常'}</span>
        <button type="button" className={account.is_blocked ? 'restore-account' : 'block-account'} disabled={changing === account.id || account.id === currentUser?.id || account.is_admin} onClick={() => void toggle(account)}>{account.is_blocked ? '恢复' : '停用'}</button>
      </article>)}
    </div>
    <p><ShieldCheck />停用后该账号不能登录或继续访问云端数据，本地浏览器数据不受影响。</p>
  </section>
}
