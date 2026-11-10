export type Role = 'ADMIN' | 'VIEWER' | 'GUEST'
export type Me = { authenticated: boolean; email: string; role: Role; csrfToken: string }
export type Album = { id: number; title: string; description: string; isPublic: boolean; photoCount: number; hasAccess: boolean }
export type Photo = {
  id: number; albumId: number; albumTitle: string; title: string; description: string;
  takenAt: string | null; capturedAt?: string | null; country: string; city: string; latitude: number | null;
  longitude: number | null; visibility: 'PUBLIC' | 'PRIVATE'; sortOrder: number; displayUrl: string
}
export type Stats = { usedBytes: number; quotaBytes: number }
export type AccessGrant = { id: number; email: string }

let csrfToken = ''

export async function getMe(): Promise<Me> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('无法连接服务器')
  const me = await response.json() as Me
  csrfToken = me.csrfToken
  return me
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET' && !csrfToken) await getMe()
  const headers = new Headers(options.headers)
  if (method !== 'GET') headers.set('X-CSRF-TOKEN', csrfToken)
  if (options.body && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || body.detail || `请求失败（${response.status}）`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function login(email: string, password: string) {
  await getMe()
  await api('/api/auth/login', { method: 'POST', body: new URLSearchParams({ username: email, password }) })
  return getMe()
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  return getMe()
}

export const getAlbums = () => api<Album[]>('/api/albums')
export const getPhotos = (albumId?: number) => api<Photo[]>(`/api/photos${albumId ? `?albumId=${albumId}` : ''}`)
export const getStats = () => api<Stats>('/api/admin/stats')

export function photoUrl(id: number, original = false) {
  return `/api/media/${id}${original ? '?size=original' : ''}`
}
