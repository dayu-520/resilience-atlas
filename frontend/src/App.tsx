import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { AuthScreen } from './components/AuthScreen'
import { PlatformAdminDashboard } from './components/PlatformAdminDashboard'
import { api, authToken } from './lib/api'
import { useAppStore } from './store'
import type { User } from './types'

export default function App() {
  const [ready, setReady] = useState(false)
  const [localSession, setLocalSession] = useState(false)
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const setWorkspaces = useAppStore((state) => state.setWorkspaces)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const setMode = useAppStore((state) => state.setMode)

  const enter = useCallback(async (userValue: User) => {
    setUser(userValue)
    if (userValue.is_admin) {
      setWorkspaces([])
      setWorkspace(null)
    } else {
      const workspaces = await api.workspaces()
      setWorkspaces(workspaces)
      setWorkspace(workspaces[0] || null)
    }
    setMode('shared')
    setLocalSession(false)
  }, [setMode, setUser, setWorkspace, setWorkspaces])

  useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('resilience_theme') || 'dark'
    if (!authToken.get()) { setReady(true); return }
    api.me().then(enter).catch(() => authToken.clear()).finally(() => setReady(true))
  }, [enter])

  if (!ready) return <div className="boot-screen"><span className="brand-mark"><i /><i /><i /></span><b>韧性云图</b><small>正在连接工作室空间</small></div>
  if (!user && !localSession) return <AuthScreen onAuthenticated={(value) => void enter(value)} onLocal={() => { setMode('local'); setLocalSession(true) }} />
  if (user?.is_admin) return <PlatformAdminDashboard onExit={() => { setUser(null); setWorkspaces([]); setWorkspace(null); setLocalSession(false) }} />
  return <AppShell onExit={() => { setUser(null); setWorkspaces([]); setWorkspace(null); setLocalSession(false) }} />
}
