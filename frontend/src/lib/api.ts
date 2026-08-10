import type { AdminDataset, AdminOverview, AdminUser, AdminWorkspace, Dataset, IdentifyResult, User, Workspace, WorkspaceApplication, WorkspaceRole } from '../types'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const TOKEN_KEY = 'resilience_atlas_token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = authToken.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const payload = await response.json()
      message = payload.detail || message
    } catch { /* response was not JSON */ }
    if (response.status === 401) authToken.clear()
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  async login(username: string, password: string) {
    const result = await request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    })
    authToken.set(result.access_token)
    return result.user
  },
  async register(input: { username: string; password: string; display_name: string; workspace_name: string }) {
    const result = await request<{ status: 'active' | 'pending'; message: string; access_token: string | null; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify(input),
    })
    if (result.access_token) authToken.set(result.access_token)
    return result
  },
  me: () => request<User>('/auth/me'),
  workspaces: () => request<Workspace[]>('/workspaces'),
  datasets: (workspaceId: string, query = '') => request<Dataset[]>(`/workspaces/${workspaceId}/datasets${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  async upload(workspaceId: string, file: File, name: string, epsg?: string, description = '') {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    form.append('description', description)
    if (epsg) form.append('epsg', epsg)
    return request<Dataset>(`/workspaces/${workspaceId}/datasets`, { method: 'POST', body: form })
  },
  patchDataset: (id: string, patch: Partial<Pick<Dataset, 'name' | 'description' | 'style'>>) => request<Dataset>(`/datasets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteDataset: (id: string) => request<void>(`/datasets/${id}`, { method: 'DELETE' }),
  async preview(id: string): Promise<Response> {
    const response = await fetch(`${API_URL}/datasets/${id}/preview`, { headers: { Authorization: `Bearer ${authToken.get()}` } })
    if (!response.ok) throw new ApiError(response.status, '无法读取地图预览')
    return response
  },
  async download(id: string, filename: string) {
    const response = await fetch(`${API_URL}/datasets/${id}/download`, { headers: { Authorization: `Bearer ${authToken.get()}` } })
    if (!response.ok) throw new ApiError(response.status, '下载失败')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
  identify: async (workspaceId: string, lng: number, lat: number): Promise<IdentifyResult> => {
    const result = await request<Omit<IdentifyResult, 'point'>>(`/workspaces/${workspaceId}/identify?lng=${lng}&lat=${lat}`)
    return { ...result, point: { lng, lat } }
  },
  members: (workspaceId: string) => request<Array<User & { role: WorkspaceRole }>>(`/workspaces/${workspaceId}/members`),
  invite: (workspaceId: string, username: string, role: WorkspaceRole) => request(`/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify({ username, role }) }),
  applications: (workspaceId: string) => request<WorkspaceApplication[]>(`/workspaces/${workspaceId}/applications`),
  reviewApplication: (workspaceId: string, applicationId: string, status: 'approved' | 'rejected', role: WorkspaceRole = 'viewer') => request<WorkspaceApplication>(`/workspaces/${workspaceId}/applications/${applicationId}`, { method: 'PATCH', body: JSON.stringify({ status, role }) }),
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  setUserBlocked: (id: string, blocked: boolean) => request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ blocked }) }),
  deleteAdminUser: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminWorkspaces: () => request<AdminWorkspace[]>('/admin/workspaces'),
  adminWorkspaceMembers: (workspaceId: string) => request<Array<User & { role: WorkspaceRole }>>(`/admin/workspaces/${workspaceId}/members`),
  removeAdminWorkspaceMember: (workspaceId: string, userId: string) => request<void>(`/admin/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
  transferAdminWorkspaceOwner: (workspaceId: string, userId: string) => request<Array<User & { role: WorkspaceRole }>>(`/admin/workspaces/${workspaceId}/transfer-owner`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  adminDatasets: () => request<AdminDataset[]>('/admin/datasets'),
}

