import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Crown, Shield, UserCheck, UserPlus, UserRound, Users, UserX } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store'
import type { User, WorkspaceApplication, WorkspaceRole } from '../types'
import { PlatformAdminPanel } from './PlatformAdminPanel'

export function TeamPanel() {
  const workspace = useAppStore((state) => state.workspace)
  const currentUser = useAppStore((state) => state.user)
  const notify = useAppStore((state) => state.notify)
  const [members, setMembers] = useState<Array<User & { role: WorkspaceRole }>>([])
  const [applications, setApplications] = useState<WorkspaceApplication[]>([])
  const [applicationRoles, setApplicationRoles] = useState<Record<string, WorkspaceRole>>({})
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('viewer')
  const [reviewing, setReviewing] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!workspace) return
    try {
      const memberList = await api.members(workspace.id)
      setMembers(memberList)
      if (workspace.role === 'owner') {
        const pending = await api.applications(workspace.id)
        setApplications(pending)
        setApplicationRoles((current) => Object.fromEntries(
          pending.map((item) => [item.id, current[item.id] || item.requested_role || 'viewer']),
        ))
      } else {
        setApplications([])
      }
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '成员信息读取失败' })
    }
  }, [notify, workspace])

  useEffect(() => { void refresh() }, [refresh])

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    if (!workspace) return
    try {
      await api.invite(workspace.id, username, role)
      setUsername('')
      await refresh()
      notify({ type: 'success', message: '成员已加入工作室' })
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '添加失败' })
    }
  }

  async function review(application: WorkspaceApplication, status: 'approved' | 'rejected') {
    if (!workspace) return
    setReviewing(application.id)
    try {
      const selectedRole = applicationRoles[application.id] || 'viewer'
      await api.reviewApplication(workspace.id, application.id, status, selectedRole)
      await refresh()
      notify({
        type: 'success',
        message: status === 'approved'
          ? `已同意 ${application.username} 加入工作室`
          : `已拒绝 ${application.username} 的申请`,
      })
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : '审批失败' })
    } finally {
      setReviewing(null)
    }
  }

  if (!workspace) return <div className="panel-body"><div className="empty-state large"><Users /><b>本地工作台没有团队成员</b><span>登录后可进入共享工作空间</span></div></div>

  return <div className="panel-body team-panel">
    <div className="section-heading"><div><h3>工作室成员</h3><span>{workspace.name} · {members.length} 人</span></div><span className="role-badge">{workspace.role}</span></div>
    {currentUser?.is_admin && <PlatformAdminPanel />}
    {workspace.role === 'owner' && <section className="invite-card application-card">
      <div><ClipboardList /><span><b>加入申请</b><small>{applications.length ? `${applications.length} 个申请等待处理` : '当前没有待处理申请'}</small></span></div>
      {!!applications.length && <div className="member-list application-list">{applications.map((application) => <article key={application.id}>
        <span className="avatar">{application.display_name.slice(0, 1).toUpperCase()}</span>
        <div><b>{application.display_name}</b><span>@{application.username} · {new Date(application.created_at).toLocaleDateString('zh-CN')}</span></div>
        <select value={applicationRoles[application.id] || 'viewer'} onChange={(event) => setApplicationRoles((current) => ({ ...current, [application.id]: event.target.value as WorkspaceRole }))}><option value="viewer">查看者</option><option value="editor">编辑者</option></select>
        <button className="approve-application" disabled={reviewing === application.id} onClick={() => void review(application, 'approved')} title="同意"><UserCheck />同意</button>
        <button className="reject-application" disabled={reviewing === application.id} onClick={() => void review(application, 'rejected')} title="拒绝"><UserX />拒绝</button>
      </article>)}</div>}
    </section>}
    {workspace.role === 'owner' && <form className="invite-card" onSubmit={invite}><div><UserPlus /><span><b>直接添加已注册账号</b><small>输入用户名并分配权限</small></span></div><input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" /><div className="invite-actions"><select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}><option value="editor">编辑者 · 可上传修改</option><option value="viewer">查看者 · 浏览和下载</option></select><button className="primary-button">添加成员</button></div></form>}
    <div className="member-list">{members.map((member) => <article key={member.id}><span className="avatar">{member.display_name.slice(0, 1).toUpperCase()}</span><div><b>{member.display_name}{member.id === currentUser?.id && <em>你</em>}</b><span>@{member.username}</span></div><span className={`member-role ${member.role}`}>{member.role === 'owner' ? <Crown /> : member.role === 'editor' ? <Shield /> : <UserRound />}{member.role === 'owner' ? '所有者' : member.role === 'editor' ? '编辑者' : '查看者'}</span></article>)}</div>
    <div className="permission-grid"><div><Crown /><b>所有者</b><span>审批成员与全部数据管理</span></div><div><Shield /><b>编辑者</b><span>上传、编辑与删除数据</span></div><div><UserRound /><b>查看者</b><span>浏览、制图与下载</span></div></div>
  </div>
}